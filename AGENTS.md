# Agent briefing

Hausmeister: self-hosted family asset manager. Read DESIGN.md first. Bun 1.4, TanStack Start (Solid, SSR, Nitro bun preset), SQLite via `bun:sqlite` + Drizzle, Better Auth, Tailwind 4 + Kobalte, Paraglide (German only). Dependencies are pinned exactly: add one with `bun add --exact`, and only on purpose.

## Layout
- `src/routes/` file routes. Pages that need login go under `_authed/` (the layout redirects to `/login`). Server routes (`server.handlers`) live here too: `health.ts`, `api/auth/$.ts` (Better Auth), `api/v1/*`.
- `src/server/` server-only code. `env.ts` holds the Zod-validated config (`getEnv()`). `db/` has the `schema.ts`, `client.ts` (`getDb()`) and `test-db.ts` modules. `auth/` holds `auth.ts` (Better Auth config), `users.ts` (create/disable users, `loadAuthCtx`), `context.ts` (`getAuth`, `withAuth`, `requireRole`, `HttpError`; safe in tests), `session.ts` (`getAuthCtx`/`requireAuthCtx`, which need a live request), `middleware.ts` (`authMiddleware`, `roleMiddleware`) and `functions.ts`. `authz/ctx.ts` has `AuthCtx`/`Role`, and `http/csrf.ts` the CSRF guard.
- `src/components/ui/` UI primitives (button, input, label, select, checkbox, textarea, dialog, card, badge, tabs, toast, dropdown-menu). `app-shell.tsx` is the header and nav.
- `src/lib/` shared code for client and server (`cn`, `auth-client`, query options, labels…). `messages/de.json` is the string catalog. `drizzle/` holds the SQL migrations; commit them.
- `src/server.ts` is the server entry (CSRF check, security headers). `src/nitro/startup.ts` validates env and migrates at process start.

## Commands
`bun run dev` · `build` · `start` · `check` (= `lint` + `typecheck` + `test`) · `format` (Biome, writes) · `db:generate` (after schema edits) · `gen` (route tree + Paraglide; `typecheck` and `test` run it first). For a quick run, `bun test path/to/file.test.ts` works once `bun run gen` has run.

## Conventions
- English code, identifiers and comments. Every user-facing string goes in `messages/de.json`, never inline.
- Every server function that touches data uses `authMiddleware` (or `roleMiddleware(...)`). Server routes use `withAuth`. Items the caller can't see answer **404, never 403** (DESIGN §11).
- Never filter items in JS: item visibility goes through the SQL predicate builder (T3). Money fields are dropped while serializing (§3.4).
- Schema: edit `schema.ts`, run `bun run db:generate`, commit `drizzle/*`. Hand-written SQL: `bun --bun drizzle-kit generate --custom --name x`. Ids come from `$defaultFn(Bun.randomUUIDv7)`, timestamps are `timestamp_ms`. `items_fts` (in `0001_*.sql`) is filled by app code.
- Users are created only via `createUserWithPassword(db, {...})`; public sign-up is off. Disable with `disableUser`.
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

## Gotchas
- In page loaders, read data with `context.queryClient.ensureQueryData(opts)` and in the component with `useQuery(() => opts)`. The router dehydrates the cache for SSR.
- Links to routes that don't exist yet fail typecheck. Cast them (`to={"/items" as "/"}`) until the route exists.
- Non-GET requests with a foreign `Origin` get 403. Send `Origin: <ORIGIN>` from curl when testing.
- Don't edit `src/routeTree.gen.ts` or `src/paraglide/`. Both are generated and gitignored.
