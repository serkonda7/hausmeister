# Hausmeister
## Server operations
Run in `/opt/hausmeister/deploy`.


### Update
```sh
./host/update.sh
```

Pulls (fast-forward only, refuses a dirty tree), rebuilds the image, recreates the stack, runs `./check-tailnet.sh`. Before migrating, the app saves `data/db/app.sqlite.pre-migrate-<time>.bak` (newest three kept, not replicated by Litestream).

A 1 GB host needs a 2 GB swapfile for the build (`sudo bash host/ensure-swap.sh`), otherwise it gets OOM-killed and looks hung.


### Roll back
```sh
docker compose stop app
cp data/db/app.sqlite.pre-migrate-<time>.bak data/db/app.sqlite
rm -f data/db/app.sqlite-wal data/db/app.sqlite-shm
git checkout <old-sha>
./host/update.sh --skip-pull
```

Afterwards `git switch main` before the next update.


### Locked out

```sh
docker compose exec app bun run create-admin-invite --force   # also: --role member|guest, --hours N
```

Open the link, sign in, reset the old account under **Verwaltung → Benutzer**.


## First admin
No sign-up; accounts come only from invites.

1. Production: set the session secret and keep it in your password manager (changing it signs everyone out).
   ```sh
   sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 48)|" deploy/.env
   ```
2. Start the app. With no users, it logs a one-time admin invite (24 h, new on each restart):
   ```sh
   docker compose logs app | grep bootstrap
   ```
   Or: `bun run create-admin-invite` (local) / `docker compose exec app bun run create-admin-invite` (server).
3. Open the link, create the account. Invite others under **Verwaltung → Einladungen**.
