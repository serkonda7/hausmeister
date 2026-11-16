# Hausmeister

Family asset manager. Design: [DESIGN.md](DESIGN.md). Phase 0 (infra) is done, see [docs/PHASE0.md](docs/PHASE0.md); the MVP is in progress. Conventions and commands: [AGENTS.md](AGENTS.md).

```sh
bun install
bun run dev          # http://localhost:3000, /health
bun run build && bun run start
```

`deploy/` holds the production stack: Tailscale sidecar, Caddy (DNS-01 via deSEC), Litestream and restic (both to Backblaze B2), and the host scripts.
