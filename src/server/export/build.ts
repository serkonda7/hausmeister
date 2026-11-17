// Builds the export archive (DESIGN §1, §3.5, §5.9) and streams it through a
// ByteWriter. Layout: docs/export-format.md. What goes in depends on
// exportScope(ctx):
//  - "all" (admin): every item with all fields, every type, location, tag,
//    grant, group (with members), user (profile fields only, see USER_COLUMNS),
//    the settings, the whole event log, every attachment and its file.
//  - "own_and_household" (member): exactly the exportItemsWhere(ctx) items,
//    serialized through the authz serializer (money follows the level), their
//    attachments (filterAttachments), grants only on items the caller manages,
//    their history redacted with the history service's redactEvent, the types,
//    locations and tags they use, and the names (only) of the people and
//    groups they refer to. References to items outside the export (a private
//    container, an `item` field, ids in history diffs) are removed; the item
//    record lists the removed keys in `omittedReferences`.
//  - "none" (guest): nothing; the caller answers 404 before getting here.
// Never exported: password hashes (accounts), sessions, passkeys,
// verifications, invite token hashes, jobs, auth e-mail aliases.
// Memory: data is read in pages of `pageSize` rows from a snapshot (see
// snapshot.ts) and written as it is read; files are streamed in 256 KiB
// chunks; between pages the loop yields to the event loop, so other requests
// keep being served while bun:sqlite works synchronously.
import { open } from "node:fs/promises";
import { and, asc, eq, gt, inArray, or, type SQL } from "drizzle-orm";
import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type ExportCounts,
  type ExportProgress,
  type ExportScopeName,
} from "../../lib/export/types";
import { formatDateTime } from "../../lib/format";
import { ancestorIds, type EffectiveField, resolveFields } from "../../lib/item-types/tree";
import { m } from "../../paraglide/messages";
import type { BlobStore } from "../attachments/storage";
import { HttpError } from "../auth/context";
import {
  exportItemsWhere,
  exportScope,
  filterAttachments,
  type Level,
  serializeItemsForCtx,
} from "../authz";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import {
  type Attachment,
  attachments,
  events,
  groupMembers,
  groups,
  itemGrants,
  items,
  itemTags,
  locations,
  settings,
  tags,
  users,
} from "../db/schema";
import { redactEvent } from "../history/service";
import { loadTypes, type TypeRecord } from "../item-types/service";
import { attachmentFileName, createPathAllocator, safeSegment } from "./paths";
import { openSnapshot } from "./snapshot";
import type { ByteWriter } from "./stream";
import {
  csvHeader,
  csvRows,
  ITEM_HEADERS,
  itemRow,
  type TableItem,
  type TableLookups,
  typeTable,
} from "./tables";
import { ZipWriter } from "./zip";

/** Archive paths (format version 1). */
export const PATHS = {
  readme: "LIESMICH.txt",
  manifest: "manifest.json",
  items: "json/items.json",
  itemTypes: "json/item-types.json",
  locations: "json/locations.json",
  tags: "json/tags.json",
  attachments: "json/attachments.json",
  grants: "json/grants.json",
  events: "json/events.json",
  users: "json/users.json",
  groups: "json/groups.json",
  settings: "json/settings.json",
  people: "json/people.json",
  itemsTable: "tabellen/gegenstaende.csv",
  filesDir: "dateien",
} as const;

/**
 * The user fields an admin export contains: the profile and role, which a
 * restore needs. Left out: `auth_email` (a synthetic sign-in alias),
 * `email_verified` and `image` (Better Auth internals), and everything in
 * sessions, accounts (password hashes), passkeys and verifications.
 */
const USER_COLUMNS = {
  id: users.id,
  username: users.username,
  displayUsername: users.displayUsername,
  displayName: users.displayName,
  email: users.email,
  role: users.role,
  locale: users.locale,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  disabledAt: users.disabledAt,
};

const FILE_CHUNK = 256 * 1024;
const TEXT_FLUSH = 64 * 1024;
const enc = new TextEncoder();
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function walkStrings(v: unknown, fn: (s: string) => void) {
  if (typeof v === "string") fn(v);
  else if (Array.isArray(v)) for (const x of v) walkStrings(x, fn);
  else if (v && typeof v === "object") for (const x of Object.values(v)) walkStrings(x, fn);
}

export type ExportOptions = {
  db: AppDb;
  ctx: AuthCtx;
  store: BlobStore;
  now?: Date;
  /** Rows per database page (default 500). */
  pageSize?: number;
  forceZip64?: boolean;
  /** Mutated while the export runs (the export page polls it). */
  progress?: ExportProgress;
  appVersion?: string;
};

export type ExportResult = { scope: ExportScopeName; counts: ExportCounts; bytes: number };

type ItemRecord = TableItem & Record<string, unknown>;

type AttachmentRecord = Attachment & { path: string | null; missing?: true };

export async function writeExport(write: ByteWriter, o: ExportOptions): Promise<ExportResult> {
  const scope = exportScope(o.ctx);
  if (scope === "none") throw new HttpError(404, "Not found");
  const snap = openSnapshot(o.db);
  try {
    return await build(write, o, scope, snap.db, snap.isolated);
  } finally {
    snap.close();
  }
}

async function build(
  write: ByteWriter,
  o: ExportOptions,
  scope: ExportScopeName,
  db: AppDb,
  isolated: boolean,
): Promise<ExportResult> {
  const { ctx } = o;
  const isAdmin = scope === "all";
  const pageSize = o.pageSize ?? 500;
  const now = o.now ?? new Date();
  const progress = o.progress;
  const setPhase = (phase: ExportProgress["phase"]) => {
    if (progress) progress.phase = phase;
  };
  const zip: ZipWriter = new ZipWriter(
    async (chunk) => {
      await write(chunk);
      if (progress) progress.bytesWritten = zip.bytesWritten;
    },
    { date: now, forceZip64: o.forceZip64 },
  );
  const allocPath = createPathAllocator();
  const scoped = () => exportItemsWhere(ctx, items);

  // --- Reference data (small; one household) --------------------------------
  const types: TypeRecord[] = loadTypes(db);
  const typeById = new Map(types.map((t) => [t.id, t]));
  const locs = db.select().from(locations).all();
  const locById = new Map(locs.map((l) => [l.id, l]));
  const allTags = db.select().from(tags).orderBy(asc(tags.name)).all();
  const tagById = new Map(allTags.map((t) => [t.id, t]));
  const userRows = db.select(USER_COLUMNS).from(users).orderBy(asc(users.username)).all();
  const userById = new Map(userRows.map((u) => [u.id, u]));
  const groupRows = db.select().from(groups).orderBy(asc(groups.name)).all();
  const groupById = new Map(groupRows.map((g) => [g.id, g]));
  const household = db.select().from(settings).get() ?? {
    id: 1,
    householdName: "",
    currency: "EUR",
    locale: "de-DE",
  };

  const exportIds = new Set(
    db
      .select({ id: items.id })
      .from(items)
      .where(scoped())
      .all()
      .map((r) => r.id),
  );
  // Ids of items that exist but are not exported (members only): references
  // to them are removed.
  const hiddenIds = new Set<string>();
  if (!isAdmin)
    for (const r of db.select({ id: items.id }).from(items).all())
      if (!exportIds.has(r.id)) hiddenIds.add(r.id);
  const isHidden = (v: unknown) => typeof v === "string" && hiddenIds.has(v);

  // Collected while writing, for the files that follow.
  const levels = new Map<string, Level>();
  const itemInfo = new Map<string, { name: string; shortCode: string | null }>();
  const typeCounts = new Map<string, number>();
  const usedLocations = new Set<string>();
  const usedTags = new Set<string>();
  const peopleIds = new Set<string>();
  const groupIds = new Set<string>(ctx.groupIds);
  const notePrincipal = (id: unknown) => {
    if (typeof id !== "string") return;
    if (userById.has(id)) peopleIds.add(id);
    else if (groupById.has(id)) groupIds.add(id);
  };
  const counts: ExportCounts = {
    items: 0,
    itemTypes: 0,
    locations: 0,
    tags: 0,
    attachments: 0,
    files: 0,
    missingFiles: 0,
    events: 0,
    grants: 0,
    users: 0,
    groups: 0,
  };

  async function textEntry(path: string) {
    const entry = await zip.begin(path, { compress: true });
    let parts: string[] = [];
    let len = 0;
    const flush = async () => {
      if (len === 0) return;
      const s = parts.join("");
      parts = [];
      len = 0;
      await entry.write(enc.encode(s));
    };
    return {
      async put(s: string) {
        parts.push(s);
        len += s.length;
        if (len >= TEXT_FLUSH) await flush();
      },
      async close() {
        await flush();
        return entry.close();
      },
    };
  }

  /** A JSON array, one record per line, from pages of records. */
  async function jsonArray(path: string, pages: AsyncIterable<unknown[]> | Iterable<unknown[]>) {
    const w = await textEntry(path);
    let n = 0;
    await w.put("[");
    for await (const page of pages)
      for (const rec of page) await w.put(`${n++ ? "," : ""}\n${JSON.stringify(rec)}`);
    await w.put(n ? "\n]\n" : "]\n");
    await w.close();
    return n;
  }

  async function jsonValue(path: string, value: unknown) {
    const w = await textEntry(path);
    await w.put(`${JSON.stringify(value, null, 2)}\n`);
    await w.close();
  }

  /** Removes references to items outside the export from one attribute value. */
  function scrubValue(v: unknown): { value: unknown; changed: boolean } {
    if (isHidden(v)) return { value: undefined, changed: true };
    if (Array.isArray(v) && v.some(isHidden))
      return { value: v.filter((x) => !isHidden(x)), changed: true };
    return { value: v, changed: false };
  }

  /** Replaces hidden item ids anywhere in a history diff with null. */
  function scrubDiff(v: unknown): unknown {
    if (isHidden(v)) return null;
    if (Array.isArray(v)) return v.map(scrubDiff);
    if (v && typeof v === "object")
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDiff(x)]));
    return v;
  }

  /** Pages of exported items as records (serialized, references scrubbed). */
  async function* itemPages(extra?: SQL): AsyncGenerator<ItemRecord[]> {
    let after = "";
    for (;;) {
      const rows = db
        .select()
        .from(items)
        .where(and(scoped(), extra, gt(items.id, after)))
        .orderBy(asc(items.id))
        .limit(pageSize)
        .all();
      if (rows.length === 0) return;
      after = rows[rows.length - 1]?.id ?? after;
      const tagMap = new Map<string, string[]>();
      for (const t of db
        .select()
        .from(itemTags)
        .where(
          inArray(
            itemTags.itemId,
            rows.map((r) => r.id),
          ),
        )
        .all()) {
        const list = tagMap.get(t.itemId);
        if (list) list.push(t.tagId);
        else tagMap.set(t.itemId, [t.tagId]);
      }
      const page: ItemRecord[] = [];
      for (const s of serializeItemsForCtx(db, ctx, rows)) {
        const { nameSort: _ns, ...rest } = s as typeof s & { nameSort?: unknown };
        const rec = { ...rest, tagIds: tagMap.get(s.id) ?? [] } as unknown as ItemRecord;
        if (!isAdmin) {
          const omitted: string[] = [];
          if (isHidden(rec.containerItemId)) {
            rec.containerItemId = null;
            omitted.push("containerItemId");
          }
          const attrs: Record<string, unknown> = { ...(rec.attributes ?? {}) };
          for (const [k, v] of Object.entries(attrs)) {
            const r = scrubValue(v);
            if (!r.changed) continue;
            omitted.push(`attributes.${k}`);
            if (r.value === undefined) delete attrs[k];
            else attrs[k] = r.value;
          }
          rec.attributes = attrs;
          if (omitted.length) rec.omittedReferences = omitted;
        }
        page.push(rec);
      }
      yield page;
      await tick();
    }
  }

  // --- json/items.json ---------------------------------------------------------
  setPhase("data");
  counts.items = await jsonArray(
    PATHS.items,
    (async function* () {
      for await (const page of itemPages()) {
        for (const rec of page) {
          levels.set(rec.id, rec.level as Level);
          itemInfo.set(rec.id, { name: rec.name, shortCode: rec.shortCode });
          typeCounts.set(rec.typeId, (typeCounts.get(rec.typeId) ?? 0) + 1);
          if (rec.locationId) usedLocations.add(rec.locationId);
          for (const t of rec.tagIds) usedTags.add(t);
          if (rec.ownerKind !== "household") notePrincipal(rec.ownerId);
          notePrincipal(rec.createdBy);
          for (const v of Object.values(rec.attributes ?? {}))
            for (const x of Array.isArray(v) ? v : [v]) if (userById.has(x)) peopleIds.add(x);
        }
        yield page;
      }
    })(),
  );

  // --- attachments: metadata, then the files ------------------------------------
  const metas: AttachmentRecord[] = [];
  {
    let after = "";
    for (;;) {
      const rows = db
        .select({ a: attachments })
        .from(attachments)
        .innerJoin(items, eq(items.id, attachments.itemId))
        .where(and(scoped(), gt(attachments.id, after)))
        .orderBy(asc(attachments.id))
        .limit(pageSize)
        .all();
      if (rows.length === 0) break;
      after = rows[rows.length - 1]?.a.id ?? after;
      for (const { a } of rows) {
        const level = levels.get(a.itemId);
        if (!level) continue;
        const [readable] = filterAttachments([a], level);
        if (readable) metas.push({ ...readable, path: null });
        notePrincipal(a.createdBy);
      }
      await tick();
    }
  }
  const folderOf = new Map<string, string>();
  const folder = (itemId: string) => {
    let f = folderOf.get(itemId);
    if (!f) {
      const info = itemInfo.get(itemId);
      f = `${PATHS.filesDir}/${safeSegment(info?.name, "Gegenstand")} (${info?.shortCode ?? itemId})`;
      folderOf.set(itemId, f);
    }
    return f;
  };
  metas.sort(
    (x, y) =>
      folder(x.itemId).localeCompare(folder(y.itemId), "de") ||
      x.sort - y.sort ||
      x.createdAt.getTime() - y.createdAt.getTime() ||
      x.id.localeCompare(y.id),
  );
  for (const a of metas)
    a.path = allocPath(`${folder(a.itemId)}/${attachmentFileName(a.originalName, a.mime, a.kind)}`);

  setPhase("files");
  if (progress) progress.filesTotal = metas.length;
  const filesByItem = new Map<string, string[]>();
  for (const a of metas) {
    const written = await writeFile(a);
    if (written) {
      counts.files++;
      const list = filesByItem.get(a.itemId);
      if (list) list.push(a.path as string);
      else filesByItem.set(a.itemId, [a.path as string]);
    } else {
      a.path = null;
      a.missing = true;
      counts.missingFiles++;
    }
    if (progress) progress.filesDone++;
  }

  async function writeFile(a: AttachmentRecord): Promise<boolean> {
    let fh: Awaited<ReturnType<typeof open>>;
    try {
      fh = await open(o.store.blobPath(a.sha256), "r");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.error("[export] blob missing", a.id, a.sha256);
        return false;
      }
      throw err;
    }
    try {
      const { size } = await fh.stat();
      const entry = await zip.begin(a.path as string, { compress: false, size });
      for (;;) {
        const buf = new Uint8Array(FILE_CHUNK);
        const { bytesRead } = await fh.read(buf, 0, FILE_CHUNK, null);
        if (bytesRead === 0) break;
        await entry.write(bytesRead === FILE_CHUNK ? buf : buf.subarray(0, bytesRead));
      }
      await entry.close();
      return true;
    } finally {
      await fh.close();
    }
  }

  setPhase("data");
  counts.attachments = await jsonArray(PATHS.attachments, [metas]);

  // --- json/events.json -----------------------------------------------------------
  const historyLocations = new Set<string>();
  counts.events = await jsonArray(
    PATHS.events,
    (async function* () {
      let after: { at: Date; id: string } | null = null;
      for (;;) {
        const cursor: SQL | undefined = after
          ? or(gt(events.at, after.at), and(eq(events.at, after.at), gt(events.id, after.id)))
          : undefined;
        const cols = {
          id: events.id,
          itemId: events.itemId,
          actorId: events.actorId,
          action: events.action,
          diff: events.diff,
          at: events.at,
        };
        type EventRow = {
          id: string;
          itemId: string | null;
          actorId: string | null;
          action: string;
          diff: unknown;
          at: Date;
        };
        const rows: EventRow[] = isAdmin
          ? db
              .select(cols)
              .from(events)
              .where(cursor)
              .orderBy(asc(events.at), asc(events.id))
              .limit(pageSize)
              .all()
          : db
              .select(cols)
              .from(events)
              .innerJoin(items, eq(items.id, events.itemId))
              .where(and(scoped(), cursor))
              .orderBy(asc(events.at), asc(events.id))
              .limit(pageSize)
              .all();
        if (rows.length === 0) return;
        const last: EventRow | undefined = rows[rows.length - 1];
        if (last) after = { at: last.at, id: last.id };
        const page: unknown[] = [];
        for (const e of rows) {
          let diff: unknown = e.diff;
          if (!isAdmin) {
            const level = e.itemId ? levels.get(e.itemId) : undefined;
            if (!level) continue;
            const redacted = redactEvent(e, level);
            if (!redacted) continue;
            diff = scrubDiff(redacted);
          }
          notePrincipal(e.actorId);
          // Ids in diffs (owners, grantees, user fields, locations) must resolve
          // within the export: note every string that names a person or place.
          walkStrings(diff, (x) => {
            if (locById.has(x)) historyLocations.add(x);
            else notePrincipal(x);
          });
          page.push({ ...e, diff });
        }
        yield page;
        await tick();
      }
    })(),
  );

  // --- json/grants.json ---------------------------------------------------------
  const grantItems = isAdmin
    ? null
    : [...levels].filter(([, l]) => l === "manage").map(([id]) => id);
  counts.grants = await jsonArray(
    PATHS.grants,
    (function* () {
      if (!grantItems) {
        yield db.select().from(itemGrants).orderBy(asc(itemGrants.itemId)).all();
        return;
      }
      for (let i = 0; i < grantItems.length; i += 500) {
        const page = db
          .select()
          .from(itemGrants)
          .where(inArray(itemGrants.itemId, grantItems.slice(i, i + 500)))
          .all();
        for (const g of page) notePrincipal(g.principalId);
        yield page;
      }
    })(),
  );

  // --- item types, locations, tags --------------------------------------------------
  const typeIds = new Set<string>();
  if (isAdmin) for (const t of types) typeIds.add(t.id);
  else
    for (const id of typeCounts.keys()) {
      typeIds.add(id);
      for (const a of ancestorIds(types, id)) typeIds.add(a);
    }
  const effective = new Map<string, EffectiveField[]>();
  const fieldsOf = (id: string) => {
    let f = effective.get(id);
    if (!f) {
      f = resolveFields(types, id);
      effective.set(id, f);
    }
    return f;
  };
  counts.itemTypes = await jsonArray(PATHS.itemTypes, [
    types.filter((t) => typeIds.has(t.id)).map((t) => ({ ...t, effectiveFields: fieldsOf(t.id) })),
  ]);

  const pathCache = new Map<string, string[]>();
  const locationPath = (id: string): string[] => {
    const cached = pathCache.get(id);
    if (cached) return cached;
    const names: string[] = [];
    const seen = new Set<string>();
    for (
      let cur = locById.get(id);
      cur && !seen.has(cur.id);
      cur = cur.parentId ? locById.get(cur.parentId) : undefined
    ) {
      seen.add(cur.id);
      names.unshift(cur.name);
    }
    pathCache.set(id, names);
    return names;
  };
  const locIds = new Set<string>();
  const addWithAncestors = (id: string) => {
    for (
      let cur = locById.get(id);
      cur && !locIds.has(cur.id);
      cur = cur.parentId ? locById.get(cur.parentId) : undefined
    )
      locIds.add(cur.id);
  };
  if (isAdmin) for (const l of locs) locIds.add(l.id);
  else for (const id of [...usedLocations, ...historyLocations]) addWithAncestors(id);
  counts.locations = await jsonArray(PATHS.locations, [
    locs
      .filter((l) => locIds.has(l.id))
      .sort((a, b) =>
        locationPath(a.id).join("/").localeCompare(locationPath(b.id).join("/"), "de"),
      )
      .map((l) => ({ ...l, path: locationPath(l.id) })),
  ]);

  counts.tags = await jsonArray(PATHS.tags, [allTags.filter((t) => isAdmin || usedTags.has(t.id))]);

  // --- people ---------------------------------------------------------------------
  if (isAdmin) {
    const members = db.select().from(groupMembers).all();
    const groupsOfUser = new Map<string, string[]>();
    const membersOfGroup = new Map<string, string[]>();
    for (const gm of members) {
      groupsOfUser.set(gm.userId, [...(groupsOfUser.get(gm.userId) ?? []), gm.groupId]);
      membersOfGroup.set(gm.groupId, [...(membersOfGroup.get(gm.groupId) ?? []), gm.userId]);
    }
    counts.users = await jsonArray(PATHS.users, [
      userRows.map((u) => ({ ...u, groupIds: groupsOfUser.get(u.id) ?? [] })),
    ]);
    counts.groups = await jsonArray(PATHS.groups, [
      groupRows.map((g) => ({ ...g, memberIds: membersOfGroup.get(g.id) ?? [] })),
    ]);
    await jsonValue(PATHS.settings, household);
  } else {
    peopleIds.add(ctx.userId);
    const people = {
      users: userRows
        .filter((u) => peopleIds.has(u.id))
        .map((u) => ({ id: u.id, displayName: u.displayName })),
      groups: groupRows.filter((g) => groupIds.has(g.id)).map((g) => ({ id: g.id, name: g.name })),
    };
    counts.users = people.users.length;
    counts.groups = people.groups.length;
    await jsonValue(PATHS.people, people);
  }

  // --- tables -------------------------------------------------------------------
  setPhase("tables");
  const lookups: TableLookups = {
    typeName: (id) => typeById.get(id)?.name ?? "",
    userName: (id) => userById.get(id)?.displayName,
    groupName: (id) => groupById.get(id)?.name,
    itemName: (id) => itemInfo.get(id)?.name,
    locationPath,
    tagName: (id) => tagById.get(id)?.name,
    files: (id) => filesByItem.get(id) ?? [],
  };
  const tables: string[] = [];
  {
    const path = allocPath(PATHS.itemsTable);
    const w = await textEntry(path);
    await w.put(csvHeader(ITEM_HEADERS()));
    for await (const page of itemPages())
      await w.put(csvRows(page.map((it) => itemRow(it, lookups))));
    await w.close();
    tables.push(path);
  }
  const typesWithItems = types
    .filter((t) => typeCounts.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const typeTables: { typeId: string; path: string }[] = [];
  for (const t of typesWithItems) {
    const path = allocPath(`tabellen/typ_${safeSegment(t.name, t.key)}.csv`);
    const table = typeTable(fieldsOf(t.id));
    const w = await textEntry(path);
    await w.put(csvHeader(table.headers));
    for await (const page of itemPages(eq(items.typeId, t.id)))
      await w.put(csvRows(page.map((it) => table.row(it, lookups))));
    await w.close();
    tables.push(path);
    typeTables.push({ typeId: t.id, path });
  }

  // --- LIESMICH.txt and manifest.json ---------------------------------------------
  setPhase("finishing");
  const me = userById.get(ctx.userId);
  const readme = [
    m.export_readme_title({ household: household.householdName }),
    "",
    m.export_readme_created({
      date: formatDateTime(now),
      name: me?.displayName ?? ctx.userId,
    }),
    isAdmin ? m.export_readme_scope_all() : m.export_readme_scope_member(),
    m.export_readme_counts({ items: counts.items, files: counts.files, events: counts.events }),
    ...(counts.missingFiles ? ["", m.export_readme_missing({ count: counts.missingFiles })] : []),
    "",
    m.export_readme_contents(),
    `- ${m.export_readme_tables()}`,
    `- ${m.export_readme_files()}`,
    `- ${m.export_readme_json()}`,
    `- ${m.export_readme_manifest()}`,
    "",
    m.export_readme_no_secrets(),
    m.export_readme_private(),
    "",
  ].join("\r\n");
  await zip.add(PATHS.readme, [enc.encode(`\uFEFF${readme}`)], { compress: true });

  const manifest = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    appVersion: o.appVersion ?? "unknown",
    createdAt: now.toISOString(),
    scope,
    snapshot: isolated,
    exportedBy: me
      ? { id: me.id, username: me.username, displayName: me.displayName, role: ctx.role }
      : { id: ctx.userId, role: ctx.role },
    household: {
      name: household.householdName,
      currency: household.currency,
      locale: household.locale,
    },
    counts,
    files: {
      items: PATHS.items,
      itemTypes: PATHS.itemTypes,
      locations: PATHS.locations,
      tags: PATHS.tags,
      attachments: PATHS.attachments,
      grants: PATHS.grants,
      events: PATHS.events,
      ...(isAdmin
        ? { users: PATHS.users, groups: PATHS.groups, settings: PATHS.settings }
        : { people: PATHS.people }),
    },
    tables: { items: tables[0], byType: typeTables },
  };
  await jsonValue(PATHS.manifest, manifest);

  const done = await zip.finish();
  if (progress) progress.bytesWritten = done.bytes;
  return { scope, counts, bytes: done.bytes };
}
