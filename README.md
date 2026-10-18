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
