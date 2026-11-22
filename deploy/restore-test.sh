#!/usr/bin/env bash
# Monthly restore test: restores the DB from Litestream and the latest restic
# snapshot into a throwaway dir, boots a throwaway app on it, checks /health
# and compares the item count of the live and the restored database.
set -euo pipefail
cd "$(dirname "$0")"
T=$(mktemp -d /tmp/hausmeister-restore.XXXXXX); NAME=hausmeister-restore-$$
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker run --rm -v "$T":/t alpine rm -rf /t/db /t/uploads >/dev/null 2>&1 || true; rm -rf "$T"; }
trap cleanup EXIT
# Prefer the exact image the live app container runs (no JSON scraping: compose
# versions differ in key order/shape, and stale containers can expose <none>).
CID=$(docker compose ps -q app 2>/dev/null | head -1)
IMG=${CID:+$(docker inspect --format '{{.Config.Image}}' "$CID" 2>/dev/null)}
if [[ -z "$IMG" ]]; then
  # Fallback: the tag Compose resolves, reading APP_VERSION from .env as systemd
  # does not export it into the script's environment.
  APP_VERSION=${APP_VERSION:-$(sed -n 's/^APP_VERSION=//p' .env | head -1)}
  IMG="hausmeister-app:${APP_VERSION:-dev}"
fi
if [[ -z "$IMG" || "$IMG" == *"<none>"* || "$IMG" == *" "* || "$IMG" == *$'\n'* || "$IMG" == *":" ]]; then
  echo "FAIL: cannot determine a valid app image (got '${IMG:-<empty>}')" >&2
  exit 1
fi
echo "app image: $IMG"

# Row count of a table in $DATABASE_PATH (read-only), run with `bun -e` inside a container.
# /health does not report items (it is public), so items are counted directly.
count_js() { echo "import {Database} from \"bun:sqlite\"; const d=new Database(process.env.DATABASE_PATH,{readonly:true}); console.log(d.query(\"select count(*) n from $1\").get().n)"; }

# Live counts (read-only) to compare against.
LIVE=$(docker compose exec -T app bun -e "$(count_js boots)")
LIVE_ITEMS=$(docker compose exec -T app bun -e "$(count_js items)")
echo "live boots: $LIVE, live items: $LIVE_ITEMS"

mkdir -p "$T/db" "$T/uploads"; chmod 777 "$T/db" "$T/uploads"
echo "== Litestream restore"
docker run --rm --user 1000:1000 --env-file .env.backup -v "$PWD/litestream.yml:/etc/litestream.yml:ro" -v "$T/db:/restore" \
  litestream/litestream:0.5.18 restore -config /etc/litestream.yml -o /restore/app.sqlite /data/db/app.sqlite

echo "== restic restore (latest uploads)"
docker compose run --rm -T -v "$T/uploads:/restore" restic restore latest --tag uploads --target /restore
LIVE_FILES=$(find data/uploads -type f | wc -l)
REST_FILES=$(find "$T/uploads" -type f | wc -l)
echo "uploads: live $LIVE_FILES files, restored $REST_FILES files"

echo "== throwaway app"
# Throwaway secret: the app refuses to start in production without one.
docker run -d --name "$NAME" --network none -e DATABASE_PATH=/data/db/app.sqlite \
  -e BETTER_AUTH_SECRET="restore-test-$(head -c 24 /dev/urandom | base64)" \
  -v "$T/db:/data/db" "$IMG" >/dev/null
for i in $(seq 1 20); do
  H=$(docker exec "$NAME" bun -e 'fetch("http://127.0.0.1:3000/health").then(r=>r.text()).then(console.log).catch(()=>process.exit(1))' 2>/dev/null) && break
  sleep 1
done
echo "health: ${H:-none}"
BOOTS=$(grep -o '"boots":[0-9]*' <<<"${H:-}" | cut -d: -f2)
REST_ITEMS=$(docker exec "$NAME" bun -e "$(count_js items)" 2>/dev/null || true)
echo "items: live $LIVE_ITEMS, restored ${REST_ITEMS:-?}"

fail=0
grep -q '"ok":true' <<<"${H:-}" || { echo "FAIL: restored app not healthy"; fail=1; }
[[ -n "$BOOTS" && "$BOOTS" -ge "$LIVE" ]] || { echo "FAIL: restored boots ${BOOTS:-?} < live $LIVE"; fail=1; }
# Live was counted before the restore, so the replica holds at least as many
# items (unless items were deleted in between: then run the test again).
[[ "$REST_ITEMS" =~ ^[0-9]+$ && "$REST_ITEMS" -ge "$LIVE_ITEMS" ]] || { echo "FAIL: restored items ${REST_ITEMS:-?} < live $LIVE_ITEMS"; fail=1; }
[[ "$REST_FILES" -ge "$LIVE_FILES" ]] || echo "WARN: fewer files restored than live (new uploads since last nightly backup?)"
[[ $fail -eq 0 ]] && echo "RESTORE TEST OK" || exit 1
