# App image, built on the VPS by compose (`build: ..`).
FROM oven/bun:1.4.4 AS build
WORKDIR /app
# Small VPS / slow link: don't open a registry connection storm during install,
# and keep downloaded tarballs across builds even when the lockfile changes.
ENV BUN_CONFIG_MAX_HTTP_REQUESTS=8 \
    BUN_INSTALL_CACHE_DIR=/root/.bun/install/cache
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache,id=hausmeister-bun-install \
    bun install --frozen-lockfile
COPY . .
RUN bun run build
# sharp loads native binaries at runtime, so it is installed as a real package
# (same pinned version as package.json) instead of being bundled. Copy the
# packages already resolved by the frozen lockfile: no registry lookup, no
# version drift, and no extra network call that can stall a rebuild.
RUN mkdir -p /deps/node_modules/@img \
 && cp -a /app/node_modules/sharp /app/node_modules/detect-libc /app/node_modules/semver /deps/node_modules/ \
 && cp -a /app/node_modules/@img/. /deps/node_modules/@img/

FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /deps/node_modules ./node_modules
COPY --from=build /app/scripts/healthcheck.ts ./scripts/healthcheck.ts
COPY --from=build /app/scripts/create-admin-invite.ts ./scripts/create-admin-invite.ts
COPY --from=build /app/package.json ./package.json
# Smoke test (DESIGN §7): sharp's platform binaries work in the runtime image.
RUN bun -e 'const s = require("sharp"); await s({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).webp().toBuffer(); console.log("sharp", s.versions.sharp, "ok")'
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["bun", "run", "scripts/healthcheck.ts"]
CMD ["bun", "run", ".output/server/index.mjs"]
