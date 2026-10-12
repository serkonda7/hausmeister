FROM oven/bun:latest AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run build

# The backend bundle includes its dependencies; only the build output and migrations are needed.
FROM oven/bun:slim
WORKDIR /app
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/drizzle backend/drizzle
COPY --from=build /app/frontend/dist frontend/dist
RUN mkdir backend/data && chown bun:bun backend/data
USER bun
VOLUME /app/backend/data
CMD ["bun", "backend/dist/index.js"]
