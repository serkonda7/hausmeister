# Hausmeister
Family book management.


## Run
```sh
bun install
bun run dev   # turbo: backend :3001 + frontend :5174
bun run typecheck
bun run build
```


## Deploy
```sh
cp .env.example .env
nano .env            # set domain
docker compose up -d --build
```

- Database: `backend/data/hausmeister.db`
- Update: `git pull`, rerun build command


## Restore from backup
Backups are restic snapshots in Backblaze B2 (config in `infra/backup/.env`; you need `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`).

```sh
docker compose stop hausmeister
mkdir -p restore
docker compose run --rm --no-deps -v "$PWD/restore:/restore" --entrypoint restic backup \
  restore latest --tag hausmeister --target /restore   # or a snapshot ID, see `restic snapshots`
cp "$(find restore -name hausmeister.db)" backend/data/hausmeister.db
rm -f backend/data/hausmeister.db-wal backend/data/hausmeister.db-shm
rm -rf restore
docker compose up -d
```

- List snapshots: `docker compose run --rm --entrypoint restic backup snapshots`
- On a new machine: clone the repo, recreate `infra/backup/.env` from `.env.example` with the same values, then run the above.
