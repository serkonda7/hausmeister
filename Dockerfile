# App image. Built on the VPS (compose `build:`) in Phase 0; CI/ghcr later.
FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts/healthcheck.ts ./scripts/healthcheck.ts
COPY --from=build /app/package.json ./package.json
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["bun", "run", "scripts/healthcheck.ts"]
CMD ["bun", "run", ".output/server/index.mjs"]
