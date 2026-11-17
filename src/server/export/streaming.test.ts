// Export behaviour under load and misuse: the member export's item set equals
// the authz predicate on random data; memory stays bounded and the event loop
// keeps running on a large archive; the per-user and global limits; client
// disconnects and idle consumers; and the snapshot under concurrent writes.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import fc from "fast-check";
import { tempStore } from "../attachments/test-helpers";
import { loadAuthCtx } from "../auth/users";
import { exportItemsWhere } from "../authz";
import type { AuthCtx, Role } from "../authz/ctx";
import { seed, TEST_TYPE_ID } from "../authz/test-fixtures";
import { type AppDb, openDatabase } from "../db/client";
import { attachments, events, items, itemTypes, users } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { writeExport } from "./build";
import { handleExportRequest } from "./handler";
import { createExportRegistry } from "./registry";
import { createProducerStream } from "./stream";
import { exportToMemory, readArchive } from "./test-helpers";

const store = tempStore();
afterAll(() => store.cleanup());
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const req = (q = "") => new Request(`http://x/api/v1/export${q}`);

describe("property: member export = exportItemsWhere", () => {
  const IDS = ["a", "b", "c", "d"] as const;
  const arb = fc.record({
    roles: fc.array(fc.constantFrom<Role>("admin", "member", "guest"), {
      minLength: 4,
      maxLength: 4,
    }),
    groups: fc.uniqueArray(fc.constantFrom("g1", "g2"), { maxLength: 2 }),
    members: fc.uniqueArray(fc.tuple(fc.constantFrom("g1", "g2"), fc.constantFrom(...IDS)), {
      maxLength: 6,
      selector: ([g, u]) => `${g}/${u}`,
    }),
    items: fc.array(
      fc.record({
        owner: fc.constantFrom<string>("household", ...IDS, "g1", "g2", "ghost"),
        visibility: fc.constantFrom("household" as const, "private" as const),
        grant: fc.option(
          fc.record({
            principal: fc.constantFrom<string>(...IDS, "g1", "g2"),
            level: fc.constantFrom(
              "view" as const,
              "use" as const,
              "edit" as const,
              "manage" as const,
            ),
          }),
        ),
        inContainer: fc.option(fc.nat(30)),
        ref: fc.option(fc.nat(30)),
      }),
      { maxLength: 25 },
    ),
  });

  test("on random data, for every member", async () => {
    await fc.assert(
      fc.asyncProperty(arb, async (d) => {
        const db = createTestDb();
        const groupsUsed = d.groups;
        seed(db, {
          users: IDS.map((id, i) => ({ id, role: d.roles[i] as Role })),
          groups: groupsUsed,
          members: d.members.filter(([g]) => groupsUsed.includes(g)),
          items: d.items.map((it, i) => ({
            id: `i${i}`,
            ownerKind:
              it.owner === "household" ? "household" : it.owner.startsWith("g") ? "group" : "user",
            ownerId: it.owner === "household" ? null : it.owner,
            visibility: it.owner === "household" ? "household" : it.visibility,
            attributes: it.ref !== null && it.ref < d.items.length ? { link: `i${it.ref}` } : {},
          })),
          grants: d.items.flatMap((it, i) =>
            it.grant
              ? [
                  {
                    itemId: `i${i}`,
                    principalKind: it.grant.principal.startsWith("g")
                      ? ("group" as const)
                      : ("user" as const),
                    principalId: it.grant.principal,
                    level: it.grant.level,
                  },
                ]
              : [],
          ),
        });
        d.items.forEach((it, i) => {
          if (it.inContainer !== null && it.inContainer < d.items.length && it.inContainer !== i)
            db.update(items)
              .set({ containerItemId: `i${it.inContainer}` })
              .where(eq(items.id, `i${i}`))
              .run();
        });
        for (const id of IDS) {
          const ctx = loadAuthCtx(db, id) as AuthCtx;
          if (ctx.role === "guest") continue;
          const want = db
            .select({ id: items.id })
            .from(items)
            .where(exportItemsWhere(ctx))
            .all()
            .map((r) => r.id)
            .sort();
          const a = await exportToMemory(db, ctx, store.store, { pageSize: 7 });
          const list =
            a.json<
              { id: string; containerItemId: string | null; attributes: Record<string, unknown> }[]
            >("json/items.json");
          expect(list.map((i) => i.id).sort()).toEqual(want);
          const inSet = new Set(want);
          // No reference leaves the set.
          for (const i of list) {
            if (i.containerItemId) expect(inSet.has(i.containerItemId)).toBe(true);
            const link = i.attributes.link;
            if (typeof link === "string") expect(inSet.has(link)).toBe(true);
          }
          const outside = d.items.map((_, i) => `i${i}`).filter((x) => !inSet.has(x));
          const blob = Object.values(a.files)
            .map((b) => Buffer.from(b).toString("utf8"))
            .join("\n");
          for (const x of outside) expect(blob.includes(`"${x}"`)).toBe(false);
        }
      }),
      { numRuns: 60 },
    );
  }, 60_000);
});

describe("streaming", () => {
  test("a 1 GiB archive with 3000 items streams in bounded memory without blocking", async () => {
    const db = createTestDb();
    db.insert(users)
      .values({
        id: "adm",
        username: "adm",
        displayName: "Adm",
        authEmail: "adm@users.invalid",
        role: "admin",
      })
      .run();
    db.insert(itemTypes).values({ id: TEST_TYPE_ID, key: "test", name: "Test" }).run();
    db.transaction((tx) => {
      for (let i = 0; i < 3000; i++)
        tx.insert(items)
          .values({
            id: `item-${String(i).padStart(5, "0")}`,
            typeId: TEST_TYPE_ID,
            name: `Gegenstand ${i} ${"x".repeat(200)}`,
            priceCents: i,
          })
          .run();
    });
    const blob = new Uint8Array(20 * 1024 * 1024);
    for (let i = 0; i < blob.length; i += 65536)
      crypto.getRandomValues(blob.subarray(i, i + 65536));
    const { sha256 } = await store.store.put(blob);
    for (let i = 0; i < 50; i++)
      db.insert(attachments)
        .values({
          itemId: `item-${String(i).padStart(5, "0")}`,
          kind: "photo",
          sha256,
          mime: "image/jpeg",
          bytes: blob.length,
          originalName: "foto.jpg",
        })
        .run();
    const ctx = loadAuthCtx(db, "adm") as AuthCtx;

    Bun.gc(true);
    const base = process.memoryUsage().rss;
    let peak = base;
    let earlyPeak = base;
    let maxGap = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 5);
    const stream = createProducerStream((w) =>
      writeExport(w, { db, ctx, store: store.store }).then(() => {}),
    );
    const reader = stream.getReader();
    let total = 0;
    let n = 0;
    const started = performance.now();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (++n % 64 === 0) {
        peak = Math.max(peak, process.memoryUsage().rss);
        if (total < 256 * 1024 * 1024) earlyPeak = peak;
      }
    }
    clearInterval(timer);
    const seconds = (performance.now() - started) / 1000;
    const growthMb = (peak - base) / 1024 / 1024;
    const lateGrowthMb = (peak - earlyPeak) / 1024 / 1024;
    console.log(
      `[export memory] archive ${(total / 1024 / 1024).toFixed(0)} MiB in ${seconds.toFixed(1)} s, rss growth ${growthMb.toFixed(1)} MiB (after the first 256 MiB: +${lateGrowthMb.toFixed(1)} MiB), max event-loop gap ${maxGap.toFixed(0)} ms`,
    );
    expect(total).toBeGreaterThan(1000 * 1024 * 1024);
    // Bounded: the working set settles early and does not grow with the archive.
    expect(growthMb).toBeLessThan(160);
    expect(lateGrowthMb).toBeLessThan(60);
    expect(maxGap).toBeLessThan(250);
  }, 120_000);
});

/** A small world: one admin, two members, some items, one 2 MB file. */
async function smallWorld(db: AppDb) {
  seed(db, {
    users: [
      { id: "adm", role: "admin" },
      { id: "m1", role: "member" },
      { id: "m2", role: "member" },
      { id: "gu", role: "guest" },
    ],
    items: Array.from({ length: 40 }, (_, i) => ({
      id: `it${String(i).padStart(2, "0")}`,
      ownerKind: "household" as const,
      ownerId: null,
    })),
  });
  const big = crypto.getRandomValues(new Uint8Array(65536));
  const body = new Uint8Array(2 * 1024 * 1024);
  for (let i = 0; i < body.length; i += big.length) body.set(big, i);
  const { sha256 } = await store.store.put(body);
  db.insert(attachments)
    .values({ itemId: "it00", kind: "photo", sha256, mime: "image/jpeg", bytes: body.length })
    .run();
  return (id: string) => loadAuthCtx(db, id) as AuthCtx;
}

const auditRows = (db: AppDb) =>
  db.select().from(events).where(eq(events.action, "export.created")).all() as {
    actorId: string;
    diff: Record<string, unknown>;
  }[];

describe("limits and disconnects", () => {
  test("one export per user, two overall; a cancelled download frees its slot", async () => {
    const db = createTestDb();
    const ctx = await smallWorld(db);
    const registry = createExportRegistry({ maxGlobal: 2 });
    const r1 = await handleExportRequest(db, ctx("m1"), store.store, req(), { registry });
    expect(r1.status).toBe(200);
    const r2 = await handleExportRequest(db, ctx("m1"), store.store, req(), { registry });
    expect(r2.status).toBe(429);
    expect(await r2.json()).toEqual({ error: "EXPORT_BUSY" });
    const r3 = await handleExportRequest(db, ctx("m2"), store.store, req(), { registry });
    expect(r3.status).toBe(200);
    const r4 = await handleExportRequest(db, ctx("adm"), store.store, req(), { registry });
    expect(r4.status).toBe(429);
    expect(await r4.json()).toEqual({ error: "EXPORT_LIMIT" });

    // m1 reads a little and goes away.
    const reader = (r1.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await reader.cancel();
    await tick(20);
    expect(registry.status("m1").active).toBeNull();
    expect(registry.status("m1").last).toMatchObject({ completed: false });
    const audit = auditRows(db).find((e) => e.actorId === "m1");
    expect(audit?.diff).toMatchObject({ completed: false, reason: "client" });

    const r5 = await handleExportRequest(db, ctx("adm"), store.store, req(), { registry });
    expect(r5.status).toBe(200);
    await r5.arrayBuffer();
    await (r3.body as ReadableStream).cancel();
    await tick(20);
    expect(registry.activeCount).toBe(0);
  });

  test("an aborted request signal ends the export", async () => {
    const db = createTestDb();
    const ctx = await smallWorld(db);
    const registry = createExportRegistry({ maxGlobal: 2 });
    const ac = new AbortController();
    const request = new Request("http://x/api/v1/export", { signal: ac.signal });
    const res = await handleExportRequest(db, ctx("m1"), store.store, request, { registry });
    await tick(10);
    ac.abort();
    await tick(20);
    expect(registry.activeCount).toBe(0);
    expect(res.status).toBe(200);
  });

  test("a consumer that stops reading is cut off after the idle timeout", async () => {
    const db = createTestDb();
    const ctx = await smallWorld(db);
    const registry = createExportRegistry({ maxGlobal: 2 });
    const res = await handleExportRequest(db, ctx("m1"), store.store, req(), {
      registry,
      idleTimeoutMs: 50,
    });
    expect(registry.activeCount).toBe(1);
    await tick(200);
    expect(registry.activeCount).toBe(0);
    expect(auditRows(db).at(-1)?.diff).toMatchObject({ completed: false, reason: "idle" });
    await expect(res.arrayBuffer()).rejects.toThrow();
  });

  test("tickets: reserved by the page, claimed once, lapsing when unused", async () => {
    const db = createTestDb();
    const ctx = await smallWorld(db);
    const registry = createExportRegistry({ maxGlobal: 2, ticketTtlMs: 50 });
    const r = registry.reserve("m1");
    if (typeof r === "string") throw new Error(r);
    expect(registry.reserve("m1")).toBe("EXPORT_BUSY");
    expect(
      (await handleExportRequest(db, ctx("m1"), store.store, req("?ticket=nope"), { registry }))
        .status,
    ).toBe(409);
    expect(
      (
        await handleExportRequest(db, ctx("m2"), store.store, req(`?ticket=${r.ticket}`), {
          registry,
        })
      ).status,
    ).toBe(409);
    const ok = await handleExportRequest(db, ctx("m1"), store.store, req(`?ticket=${r.ticket}`), {
      registry,
    });
    expect(ok.status).toBe(200);
    expect(
      (
        await handleExportRequest(db, ctx("m1"), store.store, req(`?ticket=${r.ticket}`), {
          registry,
        })
      ).status,
    ).toBe(409);
    readArchive(new Uint8Array(await ok.arrayBuffer()));
    expect(registry.status("m1").last).toMatchObject({ completed: true });

    const lapse = registry.reserve("m2");
    expect(typeof lapse).toBe("object");
    await tick(100);
    expect(registry.activeCount).toBe(0);
  });
});

describe("snapshot", () => {
  test("writes during a running export do not show up in it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-export-snap-"));
    const db = openDatabase(join(dir, "app.sqlite"));
    try {
      const ctx = await smallWorld(db);
      const stream = createProducerStream((w) =>
        writeExport(w, { db, ctx: ctx("adm"), store: store.store, pageSize: 5 }).then(() => {}),
      );
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      const first = await reader.read();
      if (first.value) chunks.push(first.value);
      // The app keeps working meanwhile.
      db.update(items).set({ name: "Umbenannt" }).run();
      seed(db, { items: [{ id: "late", ownerKind: "household", ownerId: null }] });
      db.delete(attachments).run();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const a = readArchive(new Uint8Array(Buffer.concat(chunks)));
      const list = a.json<{ id: string; name: string }[]>("json/items.json");
      expect(list).toHaveLength(40);
      expect(list.some((i) => i.name === "Umbenannt" || i.id === "late")).toBe(false);
      expect(a.text("tabellen/gegenstaende.csv")).not.toContain("Umbenannt");
      expect(a.json<unknown[]>("json/attachments.json")).toHaveLength(1);
      expect(a.json("manifest.json").snapshot).toBe(true);
      // The snapshot connection is closed: the WAL can be checkpointed fully again.
      const cp = db.$client.query("PRAGMA wal_checkpoint(TRUNCATE)").get() as { busy: number };
      expect(cp.busy).toBe(0);
    } finally {
      db.$client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
