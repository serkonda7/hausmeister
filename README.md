# Hausmeister
Family book management.


## Run
```sh
bun install
bun run dev      # turbo: backend :3001 + frontend :5174
bun run check
bun run build
```


## Deploy
```sh
cp infra/.env.example infra/.env   # set DOMAIN
docker compose -f infra/compose.yaml up -d --build
```

- App + Caddy (automatic HTTPS on :80/:443), host network, Linux only.
- Database: `data` volume. Stop the container before backing up.
- Update: `git pull`, rerun the command. Migrations run on startup.
