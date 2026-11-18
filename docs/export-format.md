# Export archive format (version 3)

`GET /api/v1/export` returns one ZIP (`hausmeister-export_YYYY-MM-DD_HH-MM.zip`,
Europe/Berlin time). This is the contract for anything that reads it back,
including a future import. Writer: `src/server/export/build.ts` (`PATHS` lists
the files). When a file or field changes meaning, bump `EXPORT_FORMAT_VERSION`
in `src/lib/export/types.ts`.

## Container

- Standard ZIP with ZIP64 records when an entry, an offset or the entry count
  needs them (archives over 4 GiB). Entries use data descriptors (bit 3) and
  UTF-8 names (bit 11). Text files are deflated; attachment files are stored
  as they are (photos and PDFs are already compressed).
- No thumbnails. Entry order is not part of the format.

## Layout

```
LIESMICH.txt                 German overview for people (UTF-8 with BOM, CRLF)
manifest.json                format, version, scope, counts, file index
json/items.json              items
json/item-types.json         item types (+ effectiveFields)
json/locations.json          locations (+ path)
json/tags.json               tags
json/attachments.json        attachment metadata (+ path inside the archive)
json/grants.json             item grants
json/events.json             event log
json/loans.json              loans (version 2)
json/contacts.json           external borrowers (version 2)
json/transfers.json          ownership transfers (version 2)
json/stock-moves.json        stock ledger (version 2)
json/item-relations.json     relations between items (version 3)
json/users.json              admin export only
json/groups.json             admin export only
json/settings.json           admin export only
json/people.json             member export only
tabellen/gegenstaende.csv    all items, for people
tabellen/ausleihen.csv       the loans, for people (version 2)
tabellen/typ_<Typname>.csv   one table per item type that has items
dateien/<Item name> (<short code>)/<file name>   attachment files
```

`manifest.json`:

```json
{
  "format": "hausmeister-export",
  "formatVersion": 3,
  "appVersion": "0.0.1",
  "createdAt": "2026-11-16T13:03:00.000Z",
  "scope": "all | own_and_household",
  "snapshot": true,
  "exportedBy": { "id": "…", "username": "…", "displayName": "…", "role": "admin" },
  "household": { "name": "…", "currency": "EUR", "locale": "de-DE" },
  "counts": { "items": 0, "itemTypes": 0, "locations": 0, "tags": 0, "attachments": 0,
              "files": 0, "missingFiles": 0, "events": 0, "grants": 0, "users": 0, "groups": 0,
              "loans": 0, "contacts": 0, "transfers": 0, "stockMoves": 0, "relations": 0 },
  "files": { "items": "json/items.json", "…": "…" },
  "tables": { "items": "tabellen/gegenstaende.csv", "loans": "tabellen/ausleihen.csv",
              "byType": [{ "typeId": "…", "path": "tabellen/typ_Werkzeug.csv" }] }
}
```

`snapshot: true` means every JSON file was read from one database snapshot.
Read file locations from `files` and `tables` rather than hard-coding them.

## JSON files

Every `json/*.json` except `people.json` and `settings.json` is an array with
one record per line. Ids are the database ids (UUIDv7 strings) and are stable:
every id an export mentions resolves inside the same export, except ids of
things deleted before the export (the event log outlives deletions).
Timestamps are ISO 8601 UTC strings; calendar dates (`acquiredOn`, date
fields) are `YYYY-MM-DD`; money is integer cents (`priceCents`) plus
`currency`.

- **items**: all item columns (`id, typeId, name, description, ownerKind,
  ownerId, visibility, locationId, containerItemId, quantity, unit, minQuantity,
  status, condition, acquiredOn, priceCents, currency, barcode, shortCode,
  attributes, createdBy, createdAt, updatedAt, version`) as the authz serializer
  returns them, plus `level` (the exporter's level on the item), `tagIds`, and
  `omittedReferences` (see member exports). `priceCents`/`currency` are absent
  (not null) below `edit`. `attributes` use the stored value shapes documented
  at the top of `src/lib/item-types/fields.ts`.
- **item-types**: `id, parentId, key, name, icon, tracking, fields, createdBy,
  createdAt, updatedAt, archivedAt`, plus `effectiveFields` (inherited + own,
  each with `sourceTypeId` and `inherited`).
- **locations**: `id, parentId, name, kind, shortCode, notes, createdAt,
  updatedAt`, plus `path` (names from the root).
- **tags**: `id, name, color`.
- **attachments**: `id, itemId, kind, sha256, mime, bytes, originalName, sort,
  createdBy, createdAt`, plus `path` (the file inside the archive). A blob that
  was missing on the server has `path: null, missing: true` and no file.
- **grants**: `itemId, principalKind, principalId, level`.
- **events**: `id, itemId, actorId, action, diff, at`. Item diffs are
  `{ field: { from, to } }`, attribute changes `attributes.<key>`.
- **loans**: `id, itemId, quantity, borrowerUserId, borrowerContactId, status, note, requestedBy, createdAt, decidedBy, decidedAt, lentBy, outAt, dueOn, returnedAt, returnedBy, updatedAt`. `status` is `requested`, `approved`, `out`, `returned`, `declined` or `cancelled`; `dueOn` is a calendar date (`YYYY-MM-DD`, Europe/Berlin). Exactly one borrower id is set, except on closed loans of a deleted contact (both null).
- **contacts**: `id, name, email, phone, notes, createdBy, createdAt, updatedAt`.
- **transfers**: `id, itemId, fromOwnerKind, fromOwnerId, toOwnerKind, toOwnerId, status, note, createdBy, createdAt, resolvedBy, resolvedAt`. `status` is `pending`, `accepted`, `declined`, `forced` or `cancelled`.
- **stock-moves**: `id, itemId, delta, quantityAfter, reason, note, userId, at`; `reason` is `used`, `restocked`, `counted`, `edited` or `other`.
- **item-relations**: `fromItemId, toItemId, kind, createdBy, createdAt`, read "from <kind> to"; `kind` is `fits` (the bag fits the vacuum), `accessory_of`, `part_of` or `replaces`. No id: the three keys are the identity.
- **users** (admin): `id, username, displayUsername, displayName, email, role,
  locale, createdAt, updatedAt, disabledAt, groupIds`.
- **groups** (admin): `id, name, createdAt, memberIds`.
- **settings** (admin): `id, householdName, currency, locale`.
- **people** (member): `{ users: [{id, displayName}], groups: [{id, name}] }`,
  the people and groups the export refers to.

## Scopes

`exportScope(ctx)` decides (DESIGN §3.5):

- **all** (admin): every item of every owner and visibility, every type,
  location, tag, grant, group, user, the settings, the complete event log, all
  attachments and files.
- **own_and_household** (member): exactly the items of `exportItemsWhere(ctx)`
  (owned directly or through a group, or household-owned), serialized at the
  member's level; their attachments after `filterAttachments`; grants only on
  items the member manages; the events of those items, redacted with
  `redactEvent` exactly as the history page does; the types (with ancestors),
  locations (with ancestors, including those named in the history) and tags
  they use; `people.json` instead of users/groups/settings. References to
  items outside the export are removed: `containerItemId` becomes null, ids
  are dropped from `item` attribute values, and ids in event diffs become
  null. The item lists the removed keys in `omittedReferences`
  (e.g. `["containerItemId", "attributes.fits"]`) so an import knows they are
  unknown, not empty.
  Loans of those items: out and returned ones for every exported item (who had it), requests (requested, approved, declined, cancelled) only on items the member manages or that they asked for; the contacts these loans name; transfers of items the member manages, started or was offered; the stock ledger of the exported items; the relations whose two items are both exported.
- **none** (guest): no export; the endpoint answers like an unknown URL.

Never in any export: password hashes and other `accounts` columns, sessions,
passkeys, verifications, invites (token hashes), jobs, `users.auth_email`,
`users.email_verified`, `users.image`.
Nor notifications (each user's own inbox).

## CSV tables

For German Excel and LibreOffice: UTF-8 with BOM, `;` as delimiter, CRLF,
RFC 4180 quoting; text cells starting with `= + - @`, tab or CR get a leading
`'` (formula guard, `src/lib/csv.ts`). Values are for reading: German column
names and labels, names instead of ids, location paths as `Keller › Regal 2`,
dates `16.11.2026`, timestamps `16.11.2026 14:03` (Europe/Berlin), numbers
without thousands separator and with a decimal comma (`129,99`). The `Dateien`
column lists the archive paths of an item's files, one per line. The last
column is the item id, which links a row to `json/items.json`.

`typ_<Typname>.csv` holds the items of exactly that type (not subtypes):
common columns, one column per active field (inherited ones included; the
field label, with the key appended when two labels collide), `Alte Felder`
for hidden or removed fields, and the id.

`ausleihen.csv` has one row per exported loan, oldest first: item, short code, borrower (name), quantity, status, created, out, due, returned, note, loan id.

## Version history

- **3** (v1.2): `item-relations` and `counts.relations`. Date fields may carry `warranty: true` (in `item-types`). Starter spare parts no longer have the `fits` attribute: an upgrade turned its values into `fits` relations.
- **2** (v1.1): `loans`, `contacts`, `transfers`, `stock-moves`, `tabellen/ausleihen.csv`, the matching `counts` and `tables.loans`.
- **1** (MVP): the first format.

## Files

`dateien/<item name> (<short code or id>)/<original file name><extension>`.
Segments are sanitized (no separators, control or Windows-reserved
characters, bounded length); the extension follows the MIME type; a taken path
(case-insensitive) gets ` (2)`, ` (3)` … before the extension. Each attachment
row has its own file, even when two rows share a blob.
