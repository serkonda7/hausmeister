# Hausmeister

Family asset manager. Design: [DESIGN.md](DESIGN.md). Phase 0 (infra) is done, see [docs/PHASE0.md](docs/PHASE0.md); the MVP is in progress. Conventions and commands: [AGENTS.md](AGENTS.md).

```sh
bun install
bun run dev          # http://localhost:3000, /health
bun run build && bun run start
```

`deploy/` holds the production stack: Tailscale sidecar, Caddy (DNS-01 via deSEC), Litestream and restic (both to Backblaze B2), and the host scripts.

## First start: the first admin account

Accounts are created only through invite links; there is no open sign-up and no setup page.

1. **Set the secret** (production): put `AUTH_SECRET` in `deploy/.env`, e.g. `openssl rand -base64 48`. Compose passes it to the app as `BETTER_AUTH_SECRET`; without it the app refuses to start. Keep it in your password manager; a new secret signs everyone out.
2. **Start the app** (`bun run dev` locally, `docker compose up -d` on the server). While there are no users at all, the app prints a one-time admin invite link (valid 24 h) to its log at startup:
   ```sh
   docker compose logs app | grep bootstrap
   # [bootstrap] https://sub.example.de/invite/…
   ```
   Each restart without users replaces the link with a new one.
3. **Or** create a link by hand:
   ```sh
   bun run create-admin-invite                            # local (./data/db/app.sqlite)
   docker compose exec app bun run create-admin-invite    # in the container
   ```
4. Open the link, choose username, display name and password. You are signed in and invite everyone else under **Verwaltung → Einladungen**.

**Recovery** (no admin can sign in): `docker compose exec app bun run create-admin-invite --force` creates an admin link even though admins exist. With the new account, set the old account's password under Verwaltung → Benutzer. Other options: `--role member|guest`, `--hours N`.

## Tests

`bun run check` runs lint, typecheck and unit tests. `bun run e2e` builds the app into its own directory and runs Playwright (Chromium, phone viewport) against it on port 3211 with a throwaway database. Once per machine: `bunx playwright install chromium`.
