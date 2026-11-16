# Hausmeister

Family asset manager. Design: [DESIGN.md](DESIGN.md). Current phase: **0 (infra)**, see [docs/PHASE0.md](docs/PHASE0.md).

```sh
bun install
bun run dev          # http://localhost:3000, /health
bun run build && bun run start
```

`deploy/` holds the production stack: Tailscale sidecar, Caddy (DNS-01 via deSEC), Litestream and restic (both to Backblaze B2), and the host scripts.
