# App image. Built on the VPS (compose `build:`) in Phase 0; CI/ghcr later.
FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
# sharp loads native binaries at runtime, so it is installed as a real package
# (same pinned version as package.json) instead of being bundled.
RUN mkdir /deps && cd /deps && echo '{"private":true}' > package.json \
 && bun add --exact "sharp@$(bun -p 'require("/app/package.json").dependencies.sharp')"

FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /deps/node_modules ./node_modules
COPY --from=build /app/scripts/healthcheck.ts ./scripts/healthcheck.ts
COPY --from=build /app/package.json ./package.json
# Smoke test (DESIGN §7): sharp's platform binaries work in the runtime image.
RUN bun -e 'const s = require("sharp"); await s({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).webp().toBuffer(); console.log("sharp", s.versions.sharp, "ok")'
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["bun", "run", "scripts/healthcheck.ts"]
CMD ["bun", "run", ".output/server/index.mjs"]
