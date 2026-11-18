// Export contents per role (DESIGN §3.5, §11): what goes in, what never does.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { strFromU8 } from "fflate";
import { tempStore } from "../attachments/test-helpers";
import { recordEvent } from "../audit";
import { exportItemsWhere } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import { createContact } from "../contacts/service";
import {
  accounts,
  attachments,
  events,
  invites,
  items,
  passkeys,
  sessions,
  users,
  verifications,
} from "../db/schema";
import { recordItemEvent } from "../history/record";
import { setupFixture } from "../items/test-fixtures";
import { checkoutItem, requestLoan } from "../loans/service";
import { createLocation } from "../locations/service";
import { addItemRelation } from "../relations/service";
import { adjustStock } from "../stock/service";
import { startTransfer } from "../transfers/service";
import { writeExport } from "./build";
import { createExportRegistry } from "./registry";
import { getExportInfo, reserveExport } from "./service";
import { exportToMemory, type Json, type ReadArchive } from "./test-helpers";

const SECRETS = {
  password: "SENTINEL-password-hash-7f3a",
  accessToken: "SENTINEL-access-token-91c2",
  refreshToken: "SENTINEL-refresh-token-0b8e",
  idToken: "SENTINEL-id-token-55d1",
  sessionToken: "SENTINEL-session-token-c4a9",
  sessionIp: "203.0.113.77",
  sessionAgent: "SENTINEL-user-agent-2e6f",
  passkeyPublicKey: "SENTINEL-passkey-public-key-a1b7",
  passkeyCredential: "SENTINEL-passkey-credential-3d90",
  verificationValue: "SENTINEL-verification-value-8c21",
  verificationIdentifier: "SENTINEL-verification-identifier-6e44",
  inviteHash: "SENTINEL-invite-token-hash-fa12",
  authEmail: "sentinel-auth-alias@users.invalid",
};

const store = tempStore();
const f = setupFixture();
const { db, admin, anna, ben, gast, group } = f;
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytes = (s: string) => new TextEncoder().encode(s);

let w: Awaited<ReturnType<typeof world>>;

async function addAttachment(
  itemId: string,
  kind: "photo" | "receipt" | "manual",
  name: string,
  body: Uint8Array,
  mime = "image/jpeg",
) {
  const { sha256 } = await store.store.put(body);
  return db
    .insert(attachments)
    .values({
      itemId,
      kind,
      sha256,
      mime,
      bytes: body.length,
      originalName: name,
      createdBy: admin.userId,
    })
    .returning()
    .get();
}

async function world() {
  const keller = createLocation(db, admin, { name: "Keller" });
  const regal = createLocation(db, admin, { name: "Regal 2", parentId: keller.id });
  const bensZimmer = createLocation(db, admin, { name: "Bens Zimmer" });

  const annaPrivate = f.item(anna, {
    name: "Annas Tagebuch",
    owner: { ownerKind: "user", ownerId: anna.userId },
    visibility: "private",
    priceCents: 1234,
    locationId: regal.id,
    tags: ["Privat"],
  });
  const benBox = f.item(ben, {
    name: "Bens Geheimkiste",
    owner: { ownerKind: "user", ownerId: ben.userId },
    visibility: "private",
    priceCents: 5000,
    locationId: bensZimmer.id,
  });
  const benVisible = f.item(ben, {
    name: "Bens Fahrrad",
    owner: { ownerKind: "user", ownerId: ben.userId },
    priceCents: 45000,
  });
  const groupPrivate = f.item(ben, {
    name: "Kinder-Spielkiste",
    owner: { ownerKind: "group", ownerId: group.id },
    visibility: "private",
  });
  const drill = f.item(admin, {
    typeId: f.power.id,
    name: "Bohrmaschine",
    priceCents: 9900,
    acquiredOn: "2024-03-05",
    locationId: regal.id,
    quantity: 1.5,
    attributes: {
      brand: "Bosch",
      voltage: 18,
      cordless: true,
      fits: [benBox.id],
      keeper: anna.userId,
      battery: "Bosch 18V",
    },
    tags: ["Werkzeug"],
  });
  const formula = f.item(anna, {
    name: '=HYPERLINK("http://evil")',
    owner: { ownerKind: "user", ownerId: anna.userId },
  });
  // Anna's item inside Ben's private box (as if Ben or an admin had put it there).
  const annaInBox = f.item(anna, {
    name: "Annas Ladegerät",
    owner: { ownerKind: "user", ownerId: anna.userId },
  });
  db.update(items)
    .set({ containerItemId: benBox.id, locationId: bensZimmer.id })
    .where(eq(items.id, annaInBox.id))
    .run();
  recordItemEvent(db, {
    actorId: ben.userId,
    action: "item.moved",
    itemId: annaInBox.id,
    diff: {
      containerItemId: { from: null, to: benBox.id },
      locationId: { from: null, to: bensZimmer.id },
    },
  });

  // Loans, contacts, transfers, stock (format version 2).
  const tom = createContact(db, anna, { name: "Nachbar Tom", phone: "0171 555" });
  const unused = createContact(db, admin, { name: "Kontakt ohne Ausleihe" });
  const drillLoan = checkoutItem(db, anna, {
    itemId: drill.id,
    borrower: { kind: "contact", id: tom.id },
    dueOn: "2026-12-01",
  });
  // A request on the household drill: Anna (edit) is not its manager.
  const adminRequest = requestLoan(db, admin, { itemId: annaInBox.id });
  const benRequest = requestLoan(db, ben, { itemId: formula.id, note: "Bitte" });
  const offer = startTransfer(db, anna, {
    itemId: formula.id,
    to: { ownerKind: "user", ownerId: ben.userId },
  });
  adjustStock(db, admin, { id: annaInBox.id, delta: 1, reason: "restocked" });
  // Relations (format version 3): Anna's charger fits the household drill; Ben's private box is an accessory of it.
  addItemRelation(db, anna, { fromItemId: annaInBox.id, toItemId: drill.id, kind: "fits" });
  addItemRelation(db, ben, { fromItemId: benBox.id, toItemId: drill.id, kind: "accessory_of" });

  const jpeg = crypto.getRandomValues(new Uint8Array(3000));
  const photo = await addAttachment(annaPrivate.id, "photo", "seite1.jpg", jpeg);
  const receipt = await addAttachment(
    annaPrivate.id,
    "receipt",
    "Rechnung.pdf",
    bytes("%PDF-1.4 anna"),
    "application/pdf",
  );
  const drillReceipt = await addAttachment(
    drill.id,
    "receipt",
    "Beleg.pdf",
    bytes("%PDF-1.4 drill"),
    "application/pdf",
  );
  const drillPhoto = await addAttachment(drill.id, "photo", "seite1.jpg", jpeg); // same name, same blob
  const benPhoto = await addAttachment(
    benBox.id,
    "photo",
    "kiste.jpg",
    bytes("ben-secret-photo-bytes"),
  );

  // Secrets of every auth table.
  db.insert(accounts)
    .values({
      accountId: anna.userId,
      providerId: "credential",
      userId: anna.userId,
      password: SECRETS.password,
      accessToken: SECRETS.accessToken,
      refreshToken: SECRETS.refreshToken,
      idToken: SECRETS.idToken,
    })
    .run();
  db.insert(sessions)
    .values({
      token: SECRETS.sessionToken,
      userId: anna.userId,
      expiresAt: new Date(Date.now() + 3600_000),
      ipAddress: SECRETS.sessionIp,
      userAgent: SECRETS.sessionAgent,
    })
    .run();
  db.insert(passkeys)
    .values({
      publicKey: SECRETS.passkeyPublicKey,
      userId: anna.userId,
      credentialID: SECRETS.passkeyCredential,
      counter: 1,
      deviceType: "singleDevice",
      backedUp: false,
    })
    .run();
  db.insert(verifications)
    .values({
      identifier: SECRETS.verificationIdentifier,
      value: SECRETS.verificationValue,
      expiresAt: new Date(Date.now() + 3600_000),
    })
    .run();
  db.insert(invites)
    .values({
      role: "member",
      tokenHash: SECRETS.inviteHash,
      expiresAt: new Date(Date.now() + 3600_000),
      createdBy: admin.userId,
    })
    .run();
  db.update(users).set({ authEmail: SECRETS.authEmail }).where(eq(users.id, ben.userId)).run();
  recordEvent(db, { actorId: admin.userId, action: "invite.created", diff: { role: "member" } });

  return {
    keller,
    regal,
    bensZimmer,
    annaPrivate,
    benBox,
    benVisible,
    groupPrivate,
    drill,
    formula,
    annaInBox,
    photo,
    receipt,
    drillReceipt,
    drillPhoto,
    benPhoto,
    jpeg,
    tom,
    unused,
    drillLoan,
    adminRequest,
    benRequest,
    offer,
  };
}

const scopeIds = (ctx: AuthCtx) =>
  db
    .select({ id: items.id })
    .from(items)
    .where(exportItemsWhere(ctx))
    .all()
    .map((r) => r.id)
    .sort();

function assertNoSecrets(a: ReadArchive) {
  const haystacks = [Buffer.from(a.raw), ...Object.values(a.files).map((b) => Buffer.from(b))];
  for (const [k, v] of Object.entries(SECRETS))
    for (const h of haystacks) expect({ k, found: h.includes(v) }).toEqual({ k, found: false });
}

/** Asserts nothing about an item outside the export appears anywhere (id, name, file bytes). */
function assertAbsent(a: ReadArchive, needles: (string | Uint8Array)[]) {
  for (const [name, body] of Object.entries(a.files)) {
    const buf = Buffer.from(body);
    for (const n of needles)
      expect({ name, n: String(n), found: buf.includes(n) }).toMatchObject({ found: false });
  }
}

/** Every attachment path in the JSON is in the ZIP with the right bytes, and nothing else is. */
function assertFilesMatch(a: ReadArchive) {
  const metas =
    a.json<{ path: string | null; sha256: string; missing?: boolean }[]>("json/attachments.json");
  const referenced = new Set<string>();
  for (const m of metas) {
    if (m.missing) continue;
    expect(m.path).toBeString();
    const body = a.files[m.path as string];
    expect(body).toBeDefined();
    expect(sha(body as Uint8Array)).toBe(m.sha256);
    referenced.add(m.path as string);
  }
  const manifest = a.json("manifest.json");
  const known = new Set<string>([
    "LIESMICH.txt",
    "manifest.json",
    ...Object.values(manifest.files as Record<string, string>),
    manifest.tables.items,
    manifest.tables.loans,
    ...manifest.tables.byType.map((t: { path: string }) => t.path),
  ]);
  for (const n of a.names)
    expect({ n, ok: referenced.has(n) || known.has(n) }).toEqual({ n, ok: true });
  for (const p of known) expect(a.names).toContain(p);
  expect(a.names.some((n) => n.includes("thumbs"))).toBe(false);
}

beforeAll(async () => {
  w = await world();
});
afterAll(() => store.cleanup());

describe("admin export", () => {
  let a: ReadArchive;
  beforeAll(async () => {
    a = await exportToMemory(db, admin, store.store);
  });

  test("contains every item, private ones of others included, with prices", () => {
    const list = a.json<Json[]>("json/items.json");
    expect(list.map((i) => i.id).sort()).toEqual(scopeIds(admin));
    const box = list.find((i) => i.id === w.benBox.id);
    expect(box).toMatchObject({
      name: "Bens Geheimkiste",
      visibility: "private",
      priceCents: 5000,
      level: "manage",
    });
    expect(list.find((i) => i.id === w.annaPrivate.id)?.priceCents).toBe(1234);
    expect(list.find((i) => i.id === w.drill.id)?.attributes.fits).toEqual([w.benBox.id]);
    expect(list.every((i) => !("nameSort" in i))).toBe(true);
  });

  test("contains receipts and their files, and all reference data", () => {
    const metas = a.json<Json[]>("json/attachments.json");
    expect(
      metas
        .filter((m) => m.kind === "receipt")
        .map((m) => m.id)
        .sort(),
    ).toEqual([w.receipt.id, w.drillReceipt.id].sort());
    expect(metas.find((m) => m.id === w.benPhoto.id)?.path).toBeString();
    expect(
      a
        .json<Json[]>("json/item-types.json")
        .map((t) => t.key)
        .sort(),
    ).toEqual(["other", "power_tool", "tool"]);
    const power = a.json<Json[]>("json/item-types.json").find((t) => t.key === "power_tool");
    expect(power.effectiveFields.map((x: { key: string }) => x.key)).toContain("brand");
    expect(
      a
        .json<Json[]>("json/locations.json")
        .map((l) => l.path.join("/"))
        .sort(),
    ).toEqual(["Bens Zimmer", "Keller", "Keller/Regal 2"]);
    expect(a.json<Json[]>("json/groups.json")).toEqual([
      expect.objectContaining({ id: group.id, memberIds: [ben.userId] }),
    ]);
    expect(a.json("json/settings.json")).toMatchObject({ currency: "EUR" });
    const ev = a.json<Json[]>("json/events.json");
    expect(ev.some((e) => e.action === "invite.created")).toBe(true);
    expect(ev.some((e) => e.action === "location.created")).toBe(true);
  });

  test("users carry the profile only", () => {
    const list = a.json<Record<string, unknown>[]>("json/users.json");
    expect(list).toHaveLength(4);
    for (const u of list)
      expect(Object.keys(u).sort()).toEqual(
        [
          "createdAt",
          "disabledAt",
          "displayName",
          "displayUsername",
          "email",
          "groupIds",
          "id",
          "locale",
          "role",
          "updatedAt",
          "username",
        ].sort(),
      );
    expect(a.names.some((n) => /session|account|passkey|verification|invite/i.test(n))).toBe(false);
  });

  test("no secret of Json auth table appears in Json byte", () => assertNoSecrets(a));
  test("files match the JSON exactly", () => assertFilesMatch(a));

  test("file paths are readable and collision-free", () => {
    const metas = a.json<Json[]>("json/attachments.json");
    const drillPaths = metas.filter((m) => m.itemId === w.drill.id).map((m) => m.path);
    expect(drillPaths).toContain(`dateien/Bohrmaschine (${w.drill.shortCode})/seite1.jpg`);
    expect(new Set(metas.map((m) => m.path)).size).toBe(metas.length);
  });

  test("manifest and readme", () => {
    const man = a.json("manifest.json");
    expect(man).toMatchObject({
      format: "hausmeister-export",
      formatVersion: 3,
      scope: "all",
      exportedBy: { id: admin.userId, role: "admin" },
    });
    expect(man.counts.items).toBe(scopeIds(admin).length);
    expect(man.counts.files).toBe(5);
    expect(a.text("LIESMICH.txt")).toContain("Admin-Export");
  });
});

describe("item relations (format 3)", () => {
  test("admin: every relation; member: only those between two exported items", async () => {
    const a = await exportToMemory(db, admin, store.store);
    const all = a.json<Json[]>("json/item-relations.json");
    expect(all.map((r) => `${r.fromItemId}>${r.kind}>${r.toItemId}`).sort()).toEqual(
      [`${w.annaInBox.id}>fits>${w.drill.id}`, `${w.benBox.id}>accessory_of>${w.drill.id}`].sort(),
    );
    expect(a.json("manifest.json").counts.relations).toBe(2);
    expect(a.json("manifest.json").files.relations).toBe("json/item-relations.json");

    const m = await exportToMemory(db, anna, store.store);
    expect(m.json<Json[]>("json/item-relations.json")).toEqual([
      expect.objectContaining({ fromItemId: w.annaInBox.id, toItemId: w.drill.id, kind: "fits" }),
    ]);
    expect(m.text("json/item-relations.json")).not.toContain(w.benBox.id);
    // The drill's history keeps the relation with the charger, not the one with Ben's box.
    const drillRelations = m
      .json<Json[]>("json/events.json")
      .filter((e) => e.itemId === w.drill.id && e.action === "item.relation_added");
    expect(drillRelations.map((e) => e.diff.relatedItemId)).toEqual([w.annaInBox.id]);
  });
});

describe("loans, contacts, transfers, stock (format 2)", () => {
  test("admin: everything", async () => {
    const a = await exportToMemory(db, admin, store.store);
    const loanIds = a.json<Json[]>("json/loans.json").map((l) => l.id);
    expect(loanIds.sort()).toEqual(
      [w.drillLoan.loanId, w.adminRequest.loanId, w.benRequest.loanId].sort(),
    );
    expect(
      a
        .json<Json[]>("json/contacts.json")
        .map((c) => c.name)
        .sort(),
    ).toEqual(["Kontakt ohne Ausleihe", "Nachbar Tom"]);
    expect(a.json<Json[]>("json/transfers.json").map((t) => t.id)).toEqual([w.offer.transferId]);
    expect(a.json<Json[]>("json/stock-moves.json")).toEqual([
      expect.objectContaining({ itemId: w.annaInBox.id, delta: 1, quantityAfter: 2 }),
    ]);
    const man = a.json("manifest.json");
    expect(man.counts).toMatchObject({ loans: 3, contacts: 2, transfers: 1, stockMoves: 1 });
    const csv = a.text(man.tables.loans);
    expect(csv).toContain("Ausgeliehen an");
    expect(csv).toContain("Nachbar Tom");
    expect(csv).toContain("01.12.2026");
  });

  test("member: loans of their items, requests only where they manage or asked", async () => {
    const a = await exportToMemory(db, anna, store.store);
    const loans = a.json<Json[]>("json/loans.json");
    // The drill's out loan (household item) and the requests on Anna's own items.
    expect(loans.map((l) => l.id).sort()).toEqual(
      [w.drillLoan.loanId, w.adminRequest.loanId, w.benRequest.loanId].sort(),
    );
    expect(a.json<Json[]>("json/contacts.json").map((c) => c.name)).toEqual(["Nachbar Tom"]);
    expect(a.json<Json[]>("json/transfers.json")).toHaveLength(1);
    // Every person a loan or transfer names resolves in people.json.
    const people = new Set(a.json("json/people.json").users.map((u: { id: string }) => u.id));
    expect(people.has(ben.userId)).toBe(true);
    expect(people.has(admin.userId)).toBe(true);

    // Ben: the household drill's loan (who has it), nothing of Anna's items, not even the offer of one of them to him.
    const b = await exportToMemory(db, ben, store.store);
    expect(b.json<Json[]>("json/loans.json").map((l) => l.id)).toEqual([w.drillLoan.loanId]);
    expect(b.json<Json[]>("json/contacts.json").map((c) => c.name)).toEqual(["Nachbar Tom"]);
    expect(b.json<Json[]>("json/transfers.json")).toEqual([]);
    expect(b.json<Json[]>("json/stock-moves.json")).toEqual([]);
  });

  test("member: a request on a household item someone else asked for stays out", async () => {
    const r = requestLoan(db, admin, { itemId: w.drill.id, note: "admin fragt" });
    const a = await exportToMemory(db, anna, store.store);
    expect(a.json<Json[]>("json/loans.json").map((l) => l.id)).not.toContain(r.loanId);
    expect(a.text("json/loans.json")).not.toContain("admin fragt");
  });
});

describe("member export", () => {
  let a: ReadArchive;
  beforeAll(async () => {
    a = await exportToMemory(db, anna, store.store);
  });

  test("contains exactly the exportItemsWhere items", () => {
    const ids = a
      .json<Json[]>("json/items.json")
      .map((i) => i.id)
      .sort();
    expect(ids).toEqual(scopeIds(anna));
    expect(ids).toContain(w.annaPrivate.id);
    expect(ids).toContain(w.drill.id);
    expect(ids).not.toContain(w.benVisible.id); // visible to Anna, but not hers
    expect(ids).not.toContain(w.benBox.id);
    expect(ids).not.toContain(w.groupPrivate.id);
  });

  test("references to items outside the export are removed", () => {
    const list = a.json<Json[]>("json/items.json");
    const drill = list.find((i) => i.id === w.drill.id);
    expect(drill.attributes.fits).toEqual([]);
    expect(drill.omittedReferences).toEqual(["attributes.fits"]);
    const inBox = list.find((i) => i.id === w.annaInBox.id);
    expect(inBox.containerItemId).toBeNull();
    expect(inBox.omittedReferences).toEqual(["containerItemId"]);
    const moved = a
      .json<Json[]>("json/events.json")
      .find((e) => e.itemId === w.annaInBox.id && e.action === "item.moved");
    expect(moved.diff.containerItemId).toEqual({ from: null, to: null });
    // Nothing about Ben's items: not their ids, names or file bytes, in Json file.
    assertAbsent(a, [
      w.benBox.id,
      "Bens Geheimkiste",
      w.benVisible.id,
      "Bens Fahrrad",
      w.groupPrivate.id,
      "Kinder-Spielkiste",
      bytes("ben-secret-photo-bytes"),
    ]);
  });

  test("money follows the level; receipts only at edit", () => {
    const list = a.json<Json[]>("json/items.json");
    for (const i of list) {
      expect(["edit", "manage"]).toContain(i.level);
      expect("priceCents" in i).toBe(true);
    }
    const metas = a.json<Json[]>("json/attachments.json");
    expect(metas.map((m) => m.id).sort()).toEqual(
      [w.photo.id, w.receipt.id, w.drillReceipt.id, w.drillPhoto.id].sort(),
    );
  });

  test("history is the item's redacted history only", () => {
    const ev = a.json<Json[]>("json/events.json");
    const scope = new Set(scopeIds(anna));
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) expect(scope.has(e.itemId)).toBe(true);
    expect(ev.some((e) => e.action === "invite.created" || e.action.startsWith("location."))).toBe(
      false,
    );
  });

  test("no user administration data; people by name only", () => {
    expect(a.names).not.toContain("json/users.json");
    expect(a.names).not.toContain("json/groups.json");
    expect(a.names).not.toContain("json/settings.json");
    const people = a.json("json/people.json");
    for (const u of people.users) expect(Object.keys(u).sort()).toEqual(["displayName", "id"]);
    expect(people.users.map((u: { id: string }) => u.id)).toContain(anna.userId);
    expect(a.text("json/people.json")).not.toContain("username");
    // Locations: the ones Anna's items use and their history names, with ancestors.
    expect(
      a
        .json<Json[]>("json/locations.json")
        .map((l) => l.name)
        .sort(),
    ).toEqual(["Bens Zimmer", "Keller", "Regal 2"]);
    expect(
      a
        .json<Json[]>("json/item-types.json")
        .map((t) => t.key)
        .sort(),
    ).toEqual(["power_tool", "tool"]);
    expect(
      a
        .json<Json[]>("json/tags.json")
        .map((t) => t.name)
        .sort(),
    ).toEqual(["Privat", "Werkzeug"]);
  });

  test("no secrets, files match", () => {
    assertNoSecrets(a);
    assertFilesMatch(a);
  });

  test("a group member exports the group's private items", async () => {
    const b = await exportToMemory(db, ben, store.store);
    const ids = b.json<Json[]>("json/items.json").map((i) => i.id);
    expect(ids.sort()).toEqual(scopeIds(ben));
    expect(ids).toContain(w.groupPrivate.id);
    expect(ids).not.toContain(w.annaPrivate.id);
    assertAbsent(b, [w.annaPrivate.id, "Annas Tagebuch", "Rechnung.pdf"]);
    assertNoSecrets(b);
  });
});

describe("guest", () => {
  test("gets nothing", async () => {
    let chunks = 0;
    await expect(
      writeExport(
        async () => {
          chunks++;
        },
        { db, ctx: gast, store: store.store },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(chunks).toBe(0);
    const reg = createExportRegistry({ maxGlobal: 2 });
    expect(() => getExportInfo(db, gast, reg)).toThrow("NOT_FOUND");
    expect(() => reserveExport(gast, reg)).toThrow("NOT_FOUND");
    expect(reg.activeCount).toBe(0);
  });
});

describe("CSV tables", () => {
  let a: ReadArchive;
  beforeAll(async () => {
    a = await exportToMemory(db, admin, store.store);
  });
  const parse = (s: string) =>
    s
      .replace(/^\uFEFF/, "")
      .split("\r\n")
      .filter(Boolean)
      .map((l) => l.split(";"));

  test("items table: German headers and formatting, formula neutralized", () => {
    const raw = a.text("tabellen/gegenstaende.csv");
    expect([...(a.files["tabellen/gegenstaende.csv"] as Uint8Array).slice(0, 3)]).toEqual([
      0xef, 0xbb, 0xbf,
    ]);
    const [head, ...rows] = parse(raw);
    expect(head?.slice(0, 8)).toEqual([
      "Kurzcode",
      "Name",
      "Typ",
      "Beschreibung",
      "Besitzer",
      "Sichtbarkeit",
      "Ort",
      "Behälter",
    ]);
    const col = (n: string) => head?.indexOf(n) ?? -1;
    const drill = rows.find((r) => r[col("Name")] === "Bohrmaschine") as string[];
    expect(drill[col("Typ")]).toBe("Elektrowerkzeug");
    expect(drill[col("Besitzer")]).toBe("Haushalt");
    expect(drill[col("Ort")]).toBe("Keller › Regal 2");
    expect(drill[col("Preis")]).toBe("99,00");
    expect(drill[col("Währung")]).toBe("EUR");
    expect(drill[col("Menge")]).toBe("1,5");
    expect(drill[col("Erworben am")]).toBe("05.03.2024");
    expect(drill[col("Schlagwörter")]).toBe("Werkzeug");
    expect(drill[col("Angelegt am")]).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
    expect(raw).toContain(`'=HYPERLINK(""http://evil"")`);
    expect(raw).not.toMatch(/[;\n]=HYPERLINK/);
    const box = rows.find((r) => r[col("Name")] === "Bens Geheimkiste") as string[];
    expect(box[col("Besitzer")]).toBe("Ben");
    expect(box[col("Sichtbarkeit")]).toBe("Privat");
  });

  test("per-type table: field labels as columns, readable values", () => {
    const man = a.json("manifest.json");
    const entry = man.tables.byType.find((t: { typeId: string }) => t.typeId === f.power.id);
    expect(entry.path).toBe("tabellen/typ_Elektrowerkzeug.csv");
    const [head, row] = parse(a.text(entry.path));
    expect(head).toEqual([
      "Kurzcode",
      "Name",
      "Besitzer",
      "Ort",
      "Status",
      "Marke",
      "Spannung",
      "Saison",
      "Größe",
      "Passt zu",
      "Hüter",
      "Farben",
      "Kabellos",
      "Akkusystem",
      "Alte Felder",
      "ID",
    ]);
    const v = (n: string) => row?.[head?.indexOf(n) ?? -1];
    expect(v("Marke")).toBe("Bosch");
    expect(v("Kabellos")).toBe("Ja");
    expect(v("Passt zu")).toBe("Bens Geheimkiste"); // admin export: the item is in it
    expect(v("Hüter")).toBe("Anna");
    expect(v("Akkusystem")).toBe("Bosch 18V");
  });

  test("member tables name nothing outside the export", async () => {
    const m = await exportToMemory(db, anna, store.store);
    const raw = m.text("tabellen/gegenstaende.csv");
    expect(raw).toContain("(nicht im Export)");
    expect(raw).not.toContain("Bens Geheimkiste");
    const per = m.text("tabellen/typ_Elektrowerkzeug.csv");
    expect(per).not.toContain("Bens Geheimkiste");
  });
});

describe("files", () => {
  test("a blob missing on disk is marked, not invented", async () => {
    const db2 = setupFixture();
    const s2 = tempStore();
    try {
      const it = db2.item(db2.admin, { name: "Lampe" });
      const body = bytes("lamp-bytes");
      const { sha256 } = await s2.store.put(body);
      db2.db
        .insert(attachments)
        .values({ itemId: it.id, kind: "photo", sha256, mime: "image/png", bytes: body.length })
        .run();
      db2.db
        .insert(attachments)
        .values({
          itemId: it.id,
          kind: "manual",
          sha256: "a".repeat(64),
          mime: "application/pdf",
          bytes: 3,
        })
        .run();
      const a = await exportToMemory(db2.db, db2.admin, s2.store);
      const metas = a.json<Json[]>("json/attachments.json");
      expect(metas.filter((m) => m.missing)).toHaveLength(1);
      expect(metas.find((m) => m.missing).path).toBeNull();
      expect(a.json("manifest.json").counts).toMatchObject({ files: 1, missingFiles: 1 });
      expect(a.text("LIESMICH.txt")).toContain("fehlten");
      assertFilesMatch(a);
    } finally {
      s2.cleanup();
    }
  });

  test("ZIP64 records read back (forced on a small archive)", async () => {
    const a = await exportToMemory(db, admin, store.store, { forceZip64: true });
    assertFilesMatch(a);
    const unzip = Bun.which("unzip");
    if (!unzip) return;
    const p = `${store.dir}/z64.zip`;
    await Bun.write(p, a.raw);
    const r = Bun.spawnSync([unzip, "-tq", p]);
    expect(strFromU8(r.stdout)).toContain("No errors detected");
    rmSync(p);
  });
});

describe("audit", () => {
  test("the handler records export.created with scope and counts", async () => {
    const { handleExportRequest } = await import("./handler");
    const before = db.select().from(events).where(eq(events.action, "export.created")).all().length;
    const res = await handleExportRequest(
      db,
      anna,
      store.store,
      new Request("http://x/api/v1/export"),
      {
        registry: createExportRegistry({ maxGlobal: 2 }),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("hausmeister-export_2026");
    await res.arrayBuffer();
    const rows = db.select().from(events).where(eq(events.action, "export.created")).all();
    expect(rows.length).toBe(before + 1);
    const ev = rows.at(-1);
    expect(ev?.itemId).toBeNull();
    expect(ev?.actorId).toBe(anna.userId);
    expect(ev?.diff).toMatchObject({
      scope: "own_and_household",
      completed: true,
      counts: { items: scopeIds(anna).length },
    });
  });

  test("guests get the not-found answer from the handler", async () => {
    const { handleExportRequest } = await import("./handler");
    const reg = createExportRegistry({ maxGlobal: 2 });
    const res = await handleExportRequest(
      db,
      gast,
      store.store,
      new Request("http://x/api/v1/export"),
      {
        registry: reg,
        notFound: () => new Response("nf", { status: 404 }),
      },
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("nf");
    expect(reg.activeCount).toBe(0);
  });
});
