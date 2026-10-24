#!/usr/bin/env bash
set -euo pipefail

DB=/data/hausmeister.db
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

restic cat config >/dev/null 2>&1 || restic init

sqlite3 "$DB" ".backup '$TMP/hausmeister.db'"
[ "$(sqlite3 "$TMP/hausmeister.db" 'PRAGMA integrity_check;')" = "ok" ]

restic backup "$TMP" --tag hausmeister --host hausmeister
restic forget --tag hausmeister --host hausmeister \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

if [ -n "${HEALTHCHECK_URL:-}" ]; then curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null; fi
