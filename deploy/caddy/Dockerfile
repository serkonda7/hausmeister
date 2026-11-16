FROM caddy:2.11.9-builder AS build
RUN xcaddy build --with github.com/caddy-dns/desec
FROM caddy:2.11.9
COPY --from=build /usr/bin/caddy /usr/bin/caddy
