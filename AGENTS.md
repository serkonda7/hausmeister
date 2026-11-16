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
- Never filter items in JS: item visibility goes through the SQL predicate builder (T3). Money fields are dropped while serializing (§3.4).
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
- Form: `<AttributeFields form={form} fields={effectiveFields} searchItems={fn} />` from `src/components/item-types/attribute-fields.tsx`, inside your TanStack Form with `defaultValues.attributes = {}`. Replace `searchItemsStub` with the real item search.
- Display: `<AttributeList fields={effectiveFields} attributes={…} itemName={…} />` (`attribute-list.tsx`, shows "Alte Felder").
- Search index text: `flattenAttributesForSearch(fields, attributes, { userName, itemName })` (`src/lib/item-types/display.ts`). Reindex items after a type migration (`item.attributes_migrated` events).
- Type change: `planItemTypeChange(db, { attributes, toTypeId })` → `{kept, converted, removed, legacy, missingRequired, attributes}`; show it, write `plan.attributes` on confirm (pure: `planTypeChange` in `migrate.ts`).

## E2E tests (Playwright)
`bun run e2e` builds into `node_modules/.cache/hausmeister-e2e/` (never `.output`), starts it on port 3211 against a fresh temp DB (`e2e/server.ts`), runs `e2e/bootstrap.setup.ts` (first admin via the startup link), then every `e2e/*.e2e.ts` (not `.spec.ts`: `bun test` would pick those up) on a Pixel 7 viewport. `E2E_SKIP_BUILD=1 bunx playwright test` reuses the last build. Import `test`/`expect` from `e2e/fixtures.ts`:
- `adminPage`: signed in as the first admin (don't sign it out or change it). `page`: signed out.
- `newUser("member" | "guest" | "admin")` → `{ username, password, displayName, page }`, created through a real invite, signed in in its own context.
- Helpers: `cliInvite(role)` (link from the CLI), `acceptInvite`, `signIn`, `submitLogin`, `userMenu(page, "Mein Konto" | "Abmelden")`, `uniqueName(prefix)`. Each test has its own `X-Forwarded-For`, so per-IP limits don't leak; use unique names, the DB is shared by all tests of a run.

## Gotchas
- In page loaders, read data with `context.queryClient.ensureQueryData(opts)` and in the component with `useQuery(() => opts)`. The router dehydrates the cache for SSR.
- Links to routes that don't exist yet fail typecheck. Cast them (`to={"/items" as "/"}`) until the route exists.
- Non-GET requests with a foreign `Origin` get 403. Send `Origin: <ORIGIN>` from curl when testing.
- Don't edit `src/routeTree.gen.ts` or `src/paraglide/`. Both are generated and gitignored.
