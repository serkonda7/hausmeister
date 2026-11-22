# Hausmeister

Self-hosted family asset manager. Design: [DESIGN.md](DESIGN.md). Conventions and commands: [AGENTS.md](AGENTS.md). Server setup: [docs/infra-runbook.md](docs/infra-runbook.md). Phase 0 and the MVP are done.

```sh
bun install
bun run dev                     # http://localhost:3000 (health: /health)
bun run build && bun run start  # production build
```

`deploy/` holds the production stack: Tailscale sidecar, Caddy (certificate from Tailscale for the MagicDNS name), Litestream and restic (both to Backblaze B2), and the host scripts.

## First admin

There is no sign-up and no setup page; accounts come only from invite links.

1. Production only: set the session secret in `deploy/.env` and store it in your password manager. The app refuses to start without it; changing it signs everyone out.
   ```sh
   sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 48)|" deploy/.env
   ```
2. Start the app (`bun run dev`, or `docker compose up -d` in `deploy/` on the server). While no users exist, it logs a one-time admin invite link (valid 24 h, replaced on every restart):
   ```sh
   docker compose logs app | grep bootstrap
   # [bootstrap] https://hausmeister.<tailnet>.ts.net/invite/…
   ```
   Or create one by hand:
   ```sh
   bun run create-admin-invite                            # local (./data/db/app.sqlite)
   docker compose exec app bun run create-admin-invite    # server
   ```
3. Open the link and choose username, display name and password. Invite everyone else under **Verwaltung → Einladungen**.

**Locked out** (no admin can sign in):

```sh
docker compose exec app bun run create-admin-invite --force   # also: --role member|guest, --hours N
```

Sign in with the new account and reset the old one's password under **Verwaltung → Benutzer**.

## Operations

Run these in `/opt/hausmeister/deploy`.

**Upgrade**

```sh
./host/update.sh
```

It pulls the current branch (fast-forward only, dirty tree refused), rebuilds the app image, recreates the stack and ends with `./check-tailnet.sh`. The manual equivalent:

```sh
docker compose build --progress plain app && docker compose up -d
```

The build runs on the VPS. On a 1 GB host, ensure a 2 GB swapfile exists (`sudo bash host/ensure-swap.sh`, also set up by `host/bootstrap.sh`); `bun install` and `vite build` otherwise get OOM-killed and the build looks like it hangs. The Bun install cache is a BuildKit cache mount, and sharp is copied from the locked build install instead of a fresh registry lookup, so repeat builds need little network.

Before migrating an existing database the app writes `data/db/app.sqlite.pre-migrate-<time>.bak` (log: `[db] snapshot before migrations`) and keeps the newest three. They are local only: Litestream replicates just `app.sqlite`.

**Roll back an upgrade**

```sh
docker compose stop app
ls data/db/*.pre-migrate-*.bak
cp data/db/app.sqlite.pre-migrate-<time>.bak data/db/app.sqlite
rm -f data/db/app.sqlite-wal data/db/app.sqlite-shm
# then start the previous version:
git checkout <old-sha>
./host/update.sh --skip-pull   # or: docker compose build app && docker compose up -d
```

**Shutdown**: on SIGTERM/SIGINT (`docker stop`, any `up -d` that replaces the container) the app stops accepting requests, waits up to 5 s for open ones (`SERVER_SHUTDOWN_TIMEOUT`) and 3 s for a running job (an unfinished job reruns at next start), closes SQLite and exits 0. Look for `[shutdown] done` in the log.

**Content Security Policy**: production pages send a strict CSP with a per-request nonce (`src/server/http/csp.ts`): no inline scripts without the nonce, no eval, no framing, images from the app and `blob:`. `bun run dev` sends none. A CSP error in the browser console is a bug.

## Checks

```sh
bun run check                    # lint + typecheck
```
