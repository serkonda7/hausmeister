# Hausmeister

Personal/family book management. Multi-user with auth: first run creates the admin, admins create more users.

- Everyone (logged in) can see all books, but can only edit their own. Admins can edit all books and transfer ownership.
- New books belong to their creator (`owner_id`). Pre-existing books have no owner and are admin-only until an admin assigns an owner.

Techstack (simplified from `serkonda7/teamotp`):
- Bun monorepo with Turbo: `backend` + `frontend` + `shared`
- Backend: Hono + Drizzle/SQLite + Valibot + better-result
- Frontend: Vite + SolidJS on :5174, API on :3001 (hardcoded, no config file)
- Auth: username + password (bcrypt via `Bun.password`), Bearer token in `localStorage`
- No Docker, no server-cli, no audit log

## Run

```sh
bun install
bun run dev      # turbo: backend :3001 + frontend :5174
bun run check
bun run test
bun run build
```

## Ports (hardcoded)

- Frontend: `http://localhost:5174`
- Backend: `http://localhost:3001` (`/api/*`)

Vite proxies `/api` to the backend. See `backend/src/constants.ts`.

## API

- `GET /api/health`
- `GET /api/auth/status` → `{ setupRequired, user }` (public; `user` set when a valid Bearer token is sent)
- `POST /api/auth/setup` `{username, password, displayName?}` → first-run admin creation (409 once users exist)
- `POST /api/auth/login` `{username, password}` → `{ user, token }`
- `POST /api/auth/logout` (invalidates the token)
- `GET /api/users`, `POST /api/users` `{username, password, displayName?, isAdmin?}`, `PATCH /api/users/:id` `{username?, displayName? (null clears), password?, isAdmin?}` (admin only; password change invalidates other sessions; cannot demote the last admin), `DELETE /api/users/:id` (admin only; cannot delete self or the last admin)
- Users have an optional display name (falls back to username). Book `owner` objects carry `{id, username, displayName}` and search matches display names.
- `GET /api/books?q=&owner=` (search includes owner username; every book carries `ownerId` + `owner`)
- `POST /api/books` (owner defaults to the creator; only admins may assign another `ownerId`)
- `GET/PATCH/DELETE /api/books/:id` (PATCH/DELETE: owner or admin; only admins may change `ownerId`)
- `PUT/DELETE /api/books/:id/read` → `{ readAt }` (personal reading list: marks the book read/unread for the logged-in user; any user, any book). Book payloads carry the viewer's `readAt` (null = unread).
- `GET /api/loans?active=1`
- `POST /api/books/:id/lend`
- `POST /api/loans/:id/return`
- `GET/POST /api/books/:id/provenance` (lifecycle: `buy` | `sell` | `other` — `buy` = bought/got it, `sell` = sold/gave away, empty price = free; price in EUR cents; optional date/party)
- `PATCH/DELETE /api/provenance/:id`
- `GET /api/books/:id/provenance/summary` (`ownership`: `owned` | `disposed` | `unknown`)

All endpoints except `/api/health` and `/api/auth/*` require `Authorization: Bearer <token>`.
Book-scoped writes (book PATCH/DELETE, provenance, lend/return) additionally require ownership or admin.
