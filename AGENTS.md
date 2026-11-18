# Agent briefing

Hausmeister: self-hosted family asset manager. Read DESIGN.md first. Bun 1.4, TanStack Start (Solid, SSR, Nitro bun preset), SQLite via `bun:sqlite` + Drizzle, Better Auth, Tailwind 4 + Kobalte, Paraglide (German only). Dependencies are pinned exactly: add one with `bun add --exact`, and only on purpose.

## Layout
- `src/routes/` file routes. Pages that need login go under `_authed/` (the layout redirects to `/login`). Server routes (`server.handlers`) live here too: `health.ts`, `api/auth/$.ts` (Better Auth), `api/v1/*`.
- `src/server/` server-only code. `env.ts` holds the Zod-validated config (`getEnv()`). `db/` has the `schema.ts`, `client.ts` (`getDb()`) and `test-db.ts` modules. `auth/` holds `auth.ts` (Better Auth config), `handler.ts` + `lockout.ts` (/api/auth entry with per-username sign-in lockout), `invites.ts` (+ `invite-functions.ts`, public), `users.ts` (create/disable users, `loadAuthCtx`), `context.ts` (`getAuth`, `withAuth`, `requireRole`, `HttpError`; safe in tests), `session.ts` (`getAuthCtx`/`requireAuthCtx`, which need a live request), `middleware.ts` (`authMiddleware`, `roleMiddleware`) and `functions.ts`. `authz/ctx.ts` has `AuthCtx`/`Role`, and `http/csrf.ts` the CSRF guard, `http/rate-limit.ts` a small in-memory limiter. `admin/` has users, groups and their admin-only server functions. `audit.ts` has `recordEvent` for app-level events (`invite.*`, `user.*`, `group.*`; it refuses secret-looking diff keys).
- `src/components/ui/` UI primitives (button, input, label, select, checkbox, textarea, dialog, card, badge, tabs, toast, dropdown-menu). `app-shell.tsx` is the header and nav; `confirm-dialog.tsx` a confirm-before-acting button.
- `src/lib/` shared code for client and server (`cn`, `auth-client`, query options, labels…). `messages/de.json` is the string catalog. `drizzle/` holds the SQL migrations; commit them.
- Admin area: `src/routes/_authed/admin.tsx` is the layout with section nav; sections are listed in `src/lib/admin-sections.ts` (label, path, roles). A section route calls `guardSection(context.user.role, "/admin/x")` in `beforeLoad`; its server functions still need `roleMiddleware`. In the UI, wrap server-function calls in `runAction` (`src/lib/run-action.ts`) and throw error codes (`HttpError(409, "SOME_CODE")`); map codes to German in `src/lib/error-text.ts`.
- `src/server.ts` is the server entry (CSRF check, security headers). `src/nitro/startup.ts` validates env and migrates at process start.

## Commands
`bun run dev` · `build` · `start` · `check` (= `lint` + `typecheck` + `test`) · `format` (Biome, writes) · `db:generate` (after schema edits) · `gen` (route tree + Paraglide; `typecheck` and `test` run it first) · `e2e` (Playwright, not part of `check`) · `create-admin-invite`. For a quick run, `bun test path/to/file.test.ts` works once `bun run gen` has run.

## Conventions
- English code, identifiers and comments. Every user-facing string goes in `messages/de.json`, never inline.
- Every server function that touches data uses `authMiddleware` (or `roleMiddleware(...)`). Server routes use `withAuth`. Items the caller can't see answer **404, never 403** (DESIGN §11).
- Never filter items in JS: item visibility goes through the SQL predicate builder. Money fields are dropped while serializing (§3.4).
- Schema: edit `schema.ts`, run `bun run db:generate`, commit `drizzle/*`. Hand-written SQL: `bun --bun drizzle-kit generate --custom --name x`. Ids come from `$defaultFn(Bun.randomUUIDv7)`, timestamps are `timestamp_ms`. `items_fts` (in `0001_*.sql`) is filled by app code.
- Users are created only through invites (`acceptInvite` in `auth/invites.ts`) or, in tests, `createUserWithPassword(db, {...})`; public sign-up is off. Admin changes go through `server/admin/users.ts` (guards: last active admin, self-disable).
- `bun:sqlite` is synchronous: `db.select()...all()/get()/run()`, and `db.transaction((tx) => …)` takes a sync callback.
- Tests are `*.test.ts` next to the code, run by `bun test`. Use `createTestDb()`, never `getDb()`. Import from `auth/context`, not `auth/session`, in tests.

## Examples
Server function (simplified from `getMyProfile` in `src/server/auth/functions.ts`):
```ts
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context: { ctx } }) => ({ role: ctx.role, groups: [...ctx.groupIds] }));
```
Server route (simplified from `src/routes/api/v1/me.ts`):
```ts
export const Route = createFileRoute("/api/v1/me")({
  server: { handlers: { GET: withAuth((_args, ctx) => Response.json({ role: ctx.role })) } },
});
```
DB query (`import { and, eq } from "drizzle-orm"; import { items } from "~/server/db/schema"`):
```ts
const rows = getDb().select().from(items).where(and(eq(items.ownerKind, "user"), eq(items.ownerId, ctx.userId))).all();
```
Test with the in-memory DB (see `src/server/auth/auth.test.ts`):
```ts
const db = createTestDb();
const u = await createUserWithPassword(db, { username: "anna", password: "correct-horse", displayName: "Anna", role: "member" });
expect(loadAuthCtx(db, u.id)?.role).toBe("member");
```
`createTestAuth()` / `signInRequest()` / `cookieHeader()` in `src/server/auth/test-helpers.ts` drive real sign-ins.

German string: add `"items_empty": "Noch keine Gegenstände"` (or with params, `"x": "Hallo {name}"`) to `messages/de.json`, then `import { m } from "~/paraglide/messages"` and call `m.items_empty()` or `m.x({ name })`. Dev and build recompile it; otherwise run `bun run gen`.

## Authorization
Everything item-related goes through `~/server/authz` (index.ts); never write permission logic elsewhere.
- Lists, search, export: AND `visibleItemsWhere(ctx)` into the query (`itemsAtLeastWhere(ctx, "edit" | "manage")` for "items I can edit/manage"; pass an alias as 2nd arg). Price filter/sort only over `moneyVisibleWhere(ctx)`. Export rows: `exportItemsWhere(ctx)`.
- One item: `loadItemForCtx(db, ctx, id, min?)` → `{ item, level } | null` (null = 404). In server fns, `requireItemForCtx` throws 404 (invisible/missing) or 403 (visible, level < min).
- Output: never return a raw row. `serializeItem(item, level, { attachments })` / `serializeItemsForCtx(db, ctx, rows)` (one grants query per page; `itemLevels` if you only need levels). Below `edit` price/currency are absent and receipts dropped.
- Attachments: `filterAttachments(list, level)`; `/files/:id` uses `loadAttachmentForCtx(db, ctx, id)` (null = 404).
- App-level (§3.5): `can(ctx, action)` / `requireCan(ctx, action)` (403), `exportScope(ctx)`. Owners and grantees: `validateOwner`, `validateGrantPrincipal`.

## Item types
Field model and stored value shape per kind: top of `src/lib/item-types/fields.ts`. Server logic: `src/server/item-types/service.ts` (wrapped as `*Fn` in `functions.ts`; queries in `src/lib/item-types/queries.ts`).
- Resolve fields: `effectiveFieldsForType(db, typeId)` (server) or `getItemTypeFn` → `.effectiveFields`; `activeFields(list)` drops hidden ones. Filter by type incl. subtypes: `typeIdsWithDescendants(db, typeId)`. "Add item" picks from `itemTypesQuery(false)` (no archived).
- Validate on save: `prepareItemAttributes(db, { typeId, attributes, previous })` → `{ok, attributes}` or `{ok:false, errors}` (key → German message). It keeps legacy values from `previous`; item-reference visibility is yours to check (`collectReferences`).
- Form: `<AttributeFields form={form} fields={effectiveFields} searchItems={fn} />` from `src/components/item-types/attribute-fields.tsx`, inside your TanStack Form with `defaultValues.attributes = {}`. The default `searchItems` (`searchItemsStub` = `searchVisibleItems` in `pickers.tsx`) is the real item search.
- Display: `<AttributeList fields={effectiveFields} attributes={…} itemName={…} />` (`attribute-list.tsx`, shows "Alte Felder").
- Search index text: `flattenAttributesForSearch(fields, attributes, { userName, itemName })` (`src/lib/item-types/display.ts`). Reindex items after a type migration (`item.attributes_migrated` events).
- Type change: `planItemTypeChange(db, { attributes, toTypeId })` → `{kept, converted, removed, legacy, missingRequired, attributes}`; show it, write `plan.attributes` on confirm (pure: `planTypeChange` in `migrate.ts`).

## Items, locations, search
Services (`service.ts`, take `db, ctx`) + `functions.ts` in `src/server/{items,locations,tags,search,history}/`; inputs (Zod) `src/lib/items/inputs.ts`, output shapes `src/lib/items/types.ts`, query options `src/lib/items/queries.ts` (keys `["items",…]`, `["locations",…]`, `["tags",…]`), labels `src/lib/items/labels.ts`. Every item write takes the `version` it read and returns `{ version }`.
- Items (`server/items/functions.ts`): `createItemFn` → `{id, shortCode, version}` (admin/member; owner default household) · `getItemFn({id})` → `ItemDetail` · `resolveShortCodeFn({code})` → `{kind:"item"|"location", id}` · `updateItemFn` patch at edit (fields, price, `attributes` = all active values, `tags` = names) · `moveItemFn({id, version, locationId? | containerItemId?})` at use · `setItemStatusFn` at use (gone statuses need manage) · `changeItemTypeFn` → `{status:"preview", plan, attributes}`, again with `confirm:true` (+ `attributes` for `plan.missingRequired`) → `{status:"saved", version}` · `changeItemOwnerFn` / `setItemVisibilityFn` / `deleteItemFn` at manage · `listItemGrantsFn` / `setItemGrantFn` / `removeItemGrantFn` → `GrantRow[]` (manage) · `reassignUserItemsFn({fromUserId, to})` admin → `{count}`.
- Search (`server/search/functions.ts`): `searchItemsFn(SearchItemsInput)` → `ItemPage {items: ItemListRow[], nextCursor, total, sort, mode}`, the one list query (search page, location contents via `{locationId, locationScope:"direct"}`, container contents via `{containerId}`); `searchFacetsFn(filters)` → `SearchFacets` (types/owners/locations/tags/statuses with visible counts, `attributes` for a chosen `typeId`, `priceAvailable`); `pickItemsFn({q})` (the picker's `searchVisibleItems`). Gone = archived, given_away, sold, disposed: hidden unless `statuses` or `includeGone`. Pass `nextCursor` back as `cursor` with the same filters/sort.
- `ItemListRow`: serialized item columns + `level`, `typeName/typeIcon`, `owner {kind,id,name}`, `locationName`, `tags [{id,name,color}]`, `photoId`, `gone`, `lowStock`; `priceCents/currency` only at edit+. `ItemDetail`: `{item, type{…, effectiveFields}, owner, tags, path: Crumb[], contentsCount, attachments, references{users,items}, permissions{canUse,canEdit,canManage}, grants|null}`. `Crumb` = `{kind:"location"|"item", id, name, shortCode}` or `{kind:"hidden"}` (invisible container).
- Locations (`server/locations/functions.ts`): `listLocationsFn` → tree of `{…, itemCount, totalCount}`, `getLocationFn` → `LocationDetail {path, children, canEdit, canDelete}`, `create/update/move/deleteLocationFn` (admin/member; members delete only empty ones, admins move contents up). Tags: `listTagsFn`, `attachTagFn({itemId, version, name})`, `detachTagFn`, admin `rename/recolor/merge/deleteTagFn`.
- History: `getItemHistoryFn({itemId, cursor?})` → `{entries: [{id, at, action, actor{id,name}|null, diff}], nextCursor, names{users,groups,items,locations}}`; diffs are `{key: {from,to}}` (attributes as `attributes.<key>`), already redacted. `historyActionLabel(action)`.
- Errors: `ItemsError` "CODE[:detail]"; `parseItemsError(err)` → `{code, detail, fieldErrors}`, `itemsErrorText(err)` German (`src/lib/items/errors.ts`). `VERSION_CONFLICT` (409: reload, retry), `ATTRIBUTES_INVALID` (fieldErrors per key), `ITEM_NOT_FOUND`, `ITEM_FORBIDDEN`, `OWNER_NOT_ALLOWED`, `OWNER_INVALID`, `HOUSEHOLD_PRIVATE`, `GRANT_INVALID`, `GRANT_ABOVE_CEILING`, `CONTAINER_NOT_FOUND`/`_CYCLE`, `LOCATION_*`, `TAG_*`, `CURSOR_INVALID`, `SHORT_CODE_NOT_FOUND`. `runAction` maps these, `ATTACHMENTS_*` and app codes (`actionErrorText`); its `onError(err)` sees the raw error first (return true to skip the toast).
- Server-side writes to items outside these modules: call `reindexItems(tx, ids)` (`server/search/indexer.ts`) and keep `items.name_sort` (= `normalizeSearchText(name)`).
- Principals for pickers: `listPrincipalsFn` (admin/member) → `{users[{id,displayName,role}], groups[{id,name,member}]}`, query `principalsQuery()`.

## Item and location pages
- Routes: `_authed/index.tsx` (home), `items.index.tsx` (list), `items.new.tsx` (quick add), `items.$itemId.index.tsx` (detail + actions), `items.$itemId.edit.tsx` (edit, conflict + leave guard), `locations.index.tsx`, `locations.$locationId.tsx`. Loaders turn `ITEM_NOT_FOUND`/`LOCATION_NOT_FOUND` into `notFound()` (`isMissing`, `NotFoundCard` in `components/items/not-found.tsx`).
- List state lives in the URL: `src/lib/items/list-search.ts` (`parseItemsSearch` = `validateSearch`, `toSearchInput`, `patchSearch`; tested). Link to a filtered list with `<Link to="/items" search={{ tag: [id] }}>`.
- `components/items/`: `item-card.tsx` (`ItemResults input={SearchItemsInput}` pages with the cursor; `ItemCard`/`ItemRowView`), `item-filters.tsx`, `location-picker.tsx` (`LocationPicker` location-or-container, `LocationSelect`, `placementInput`), `owner-picker.tsx`, `tag-input.tsx`, `visibility-choice.tsx`, `type-choice.tsx`, `item-form.tsx` (base fields, `applyAttributeErrors` for server field errors), `item-actions.tsx` (`useItemWrite`: write + reload on conflict), `item-sharing.tsx`, `item-history.tsx`, `breadcrumbs.tsx`. Locations: `components/locations/`.
- Native `<select>`: set `selected` on each `<option>` too; Solid's `value` alone does not survive SSR/hydration.

## Stock, loans, transfers, inbox
- Stock (`server/stock/service.ts`): `adjustStockFn({id, delta | quantity, reason, note?})` at use, no version (changes add up) → `{quantity, version, lowStock}`. Any other write path that changes `quantity`/`minQuantity` calls `recordStockChange(tx, ctx, item, before, after, reason)`: ledger row in `stock_moves` + low-stock notice (once when it falls below, withdrawn when restocked). UI: `<StockControl item canUse />` (`components/items/stock-control.tsx`).
- Inbox (`server/notifications/service.ts`): `notify(tx, {userIds, exclude, kind, itemId, payload, dedupe?})` inside the writer's transaction; audiences `ownerAudience(tx, item)` (owners; household → all admins and members) and `managerAudience(tx, item)` (owners, manage grantees; household → admins). Kinds, payloads and German text: `src/lib/notifications.ts` (add new kinds there). Reads: `listNotificationsFn`, `unreadNotificationsFn`, `markNotificationsReadFn`; queries `["notifications", …]`. Item names show only while the reader can see the item.
- Loans (`server/loans/service.ts`, rules in its header): `checkoutItemFn` (use; `borrower` user/contact for admin/member), `requestLoanFn` (view), `approveLoanFn({loanId, handOver?})` / `declineLoanFn` (manage), `cancelLoanFn` (borrower), `handOverLoanFn`, `returnLoanFn`, `setLoanDueFn`. Reads: `getItemLoansFn({itemId})` → `ItemLoans` (each `LoanRow.actions` says what the caller may do), `getLoanOverviewFn` → `{mine, requests, lentOut}`. Shapes `src/lib/loans/types.ts`, queries `src/lib/loans/queries.ts` (under `["items", …]`). Individual items get `on_loan` while out; due dates are `YYYY-MM-DD` (`isoDayInBerlin()` in `lib/format.ts`). Contacts: `server/contacts/` (admin/member), page `/contacts`.
- Transfers (`server/transfers/service.ts`): `startTransferFn({itemId, to, note?})` (manage, never to oneself unless `canChangeOwner`), `acceptTransferFn` / `declineTransferFn` (the new owner or a member of the new group), `cancelTransferFn`, `forceTransferFn` (admin). Reads `getItemTransferFn`, `getTransferOverviewFn` → `{incoming, outgoing}`. Direct owner changes (`changeItemOwnerFn`) stay as they were.
- Codes: `LOAN_*`, `CONTACT_*`, `TRANSFER_*`, `STOCK_NEGATIVE`, `ISBN_INVALID` are ItemsError codes (German in `lib/items/errors.ts`). Loan-request and transfer-offer events are hidden below manage in the history (`redactEvent`).
- Pages: `/loans` (offers, requests, lent out, borrowed), `/notifications`, `/contacts`; home teasers read the same overview queries.

## Labels, scan, ISBN
- QR: `qrMatrix` / `qrPath` / `labelUrl` / `shortCodeFromScan` (`src/lib/qr.ts`), `<QrCode value label />` renders inline SVG. Labels encode `${ORIGIN}/q/<code>`; `/q/$code` (`_authed/q.$code.tsx`) redirects to the item or location. Sheets: `/labels?item=…&location=…&format=a4|thermal&skip=n` (`getLabelsFn`, visible entries only); page sizes are named `@page`s in `src/styles/app.css`; the app shell is `print:hidden`.
- Scan: `/scan` with `<CameraScanner onCode paused />` and `useScanSupport()` (`components/scan/camera-scanner.tsx`); without `BarcodeDetector` the code field is the fallback (headless Chromium in e2e has none). `lookupCodeFn({code})` → `CodeLookup` (`item` | `location` | `matches` by barcode/attribute value, ISBN-10 and -13 alike; `src/server/scan/service.ts`).
- ISBN: `lookupBookFn({isbn, typeId?})` → `BookLookupResult` (`found` with `name` + `attributes` for the type, `not_found`, `unavailable`). Sources and parsers in `src/server/isbn/lookup.ts` (DNB MARC21, Open Library, Google Books; fixtures in `isbn/fixtures/`), field mapping in `isbn/map.ts`. Tests inject `fetch`; never call the real services from tests. `ISBN_LOOKUP=off` (e2e sets it) answers `unavailable` without network. Helpers `toIsbn13` / `toIsbn10` / `isbnVariants` in `src/lib/isbn.ts`.
- Quick add takes `?isbn=` (book type, lookup runs) and `?barcode=`; `<IsbnFill typeId onFound onIsbn />` appears for types whose ISBN field has `lookup` sources. Shelf mode: `/items/shelf?type=&loc=`.

## Attachments
Server: `src/server/attachments/` (`service.ts` logic, `functions.ts` server fns, `upload.ts` + `serve.ts` behind the routes). Shared rules (kinds, accepted types, limits, `fileUrl(id, "thumb"?)`): `src/lib/attachments/rules.ts`.
- Item page: `<ItemAttachments itemId level />` (`src/components/attachments/item-attachments.tsx`), or the parts: `<PhotoGallery itemId level />`, `<AttachmentFileList itemId level kind="receipt"|"manual"|"other" />`, `<AttachmentUploader itemId level kinds? defaultKind? onUploaded? />`. `level` is the caller's item level; editing UI shows from `edit`. Loader: `ensureQueryData(attachmentsQuery(itemId))` (`components/attachments/queries.ts`, key `["attachments", itemId]`).
- Server fns: `listAttachmentsFn({itemId})` → `{level, attachments}`, `deleteAttachmentFn`, `setAttachmentKindFn`, `reorderAttachmentsFn({itemId, order})`, `setCoverPhotoFn`. Upload: `POST /api/v1/items/:itemId/attachments` (multipart `file` + `kind`). Files: `GET /files/:id[?size=thumb]`. Cover for lists: `coverPhotos(db, visibleItemIds)`.
- Events `attachment.added/removed`, diff `{attachmentId, kind, originalName}`. Deleting items: call `enqueueBlobGc(tx, shas)` (`attachments/gc.ts`) or leave it to the nightly sweep; never delete files yourself.
- Jobs: `enqueueJob(db, kind, payload, {runAt?})` (`server/jobs/queue.ts`). Add a handler with `addJobHandler(registry, kind, fn, {maxAttempts, backoffBaseMs, timeoutMs, recurring: {next}})` inside `registerAllJobHandlers()` in `server/jobs/handlers.ts` (relative imports). Handlers must be idempotent (a crash re-runs them). Test with `createJobWorker({db, registry}).drain()`.

## Export
`GET /api/v1/export` streams a ZIP (JSON + CSV + files); the archive layout is the contract in `docs/export-format.md` (bump `EXPORT_FORMAT_VERSION` in `src/lib/export/types.ts` when it changes). Code in `src/server/export/`: `build.ts` (`writeExport`, `PATHS`, what each scope contains), `zip.ts` (streaming ZIP64 writer), `stream.ts` (backpressured body, `ExportAborted` on disconnect/idle), `snapshot.ts` (read-only connection in one read transaction), `registry.ts` (one export per user, two overall, page tickets), `handler.ts` (route logic + `export.created` audit).
- Contents follow `exportScope(ctx)` / `exportItemsWhere(ctx)`; member exports drop references to items outside the set and list them in `omittedReferences`. Loans, contacts, transfers and stock moves follow the exported items (format version 2); notifications are never exported. Guests get the router's own not-found page (`src/routes/api/v1/export.ts`).
- New table or column: decide whether it is exported (admin and member), add it to `build.ts`, the doc and the secret-sentinel test in `export.test.ts`. Secrets (auth tables, invite hashes) never go in.
- Page: `/admin/export` reserves a slot with `reserveExportFn`, then opens `?ticket=…`; `getExportInfoFn` gives the estimate and progress. Tests: `exportToMemory()` in `src/server/export/test-helpers.ts`.

## E2E tests (Playwright)
`bun run e2e` builds into `node_modules/.cache/hausmeister-e2e/` (never `.output`), starts it on port 3211 against a fresh temp DB (`e2e/server.ts`), runs `e2e/bootstrap.setup.ts` (first admin via the startup link), then every `e2e/*.e2e.ts` (not `.spec.ts`: `bun test` would pick those up) on a Pixel 7 viewport. `E2E_SKIP_BUILD=1 bunx playwright test` reuses the last build. Import `test`/`expect` from `e2e/fixtures.ts`:
- `adminPage`: signed in as the first admin (don't sign it out or change it). `page`: signed out.
- `newUser("member" | "guest" | "admin")` → `{ username, password, displayName, page }`, created through a real invite, signed in in its own context.
- Helpers: `cliInvite(role)` (link from the CLI), `acceptInvite`, `signIn`, `submitLogin`, `userMenu(page, "Mein Konto" | "Abmelden")`, `uniqueName(prefix)`. Each test has its own `X-Forwarded-For`, so per-IP limits don't leak; use unique names, the DB is shared by all tests of a run.
- Item helpers (`e2e/item-helpers.ts`): `addItem(page, {type, name, photo?, more?})` → id, `ownMore({private?, price?})`, `searchItems`, `results(page)`, `selectByText(select, /re/)`, `token()`, `photoFile()`. Visually hidden radios/checkboxes: click their label. Accessibility: `@axe-core/playwright` (`e2e/a11y.e2e.ts`).

## Hardening
- CSP (production only): every inline script needs the request nonce. Router scripts get it via `ssr.nonce` (`src/lib/csp-nonce.ts`); never add `<script>` or `<style>` elements by hand, never `eval`/`new Function` (Zod runs `jitless`, `src/lib/zod-config.ts` must stay the first import of `router.tsx`). `style` attributes are allowed. Every e2e test fails on a CSP violation (`cspViolations` fixture).
- Slow links: use `useHydrated()` / `adoptTypedValue()` from `src/lib/hydrated.ts` for forms (submit disabled with "Lädt …" until hydrated; `<html data-hydrated>` is set in `__root.tsx`). Test with `slowLink()` in `e2e/hydration.e2e.ts`.
- Shutdown: `src/server/shutdown.ts` (wired in the startup plugin). The DB connection is one per process (`getDb()`, on globalThis); close with `closeDb()`/`closeDatabase()`, never `$client.close()` alone. Long-running work must watch the job `signal`.
- Quick add shows a type's required fields next to the name; keep it that way when adding field kinds.
- List filters: `unplaced` (no location, no container) and `pmin`/`pmax` (euros) in `list-search.ts`; `SearchFacets.unplacedCount`.

## Gotchas
- In page loaders, read data with `context.queryClient.ensureQueryData(opts)` and in the component with `useQuery(() => opts)`. The router dehydrates the cache for SSR.
- Links to routes that don't exist yet fail typecheck. Cast them (`to={"/x" as "/"}`) until the route exists.
- Non-GET requests with a foreign `Origin` get 403. Send `Origin: <ORIGIN>` from curl when testing.
- Don't edit `src/routeTree.gen.ts` or `src/paraglide/`. Both are generated and gitignored.
