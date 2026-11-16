#!/usr/bin/env bash
# Nightly restic backup of ./data/uploads (run by hausmeister-backup.timer).
set -euo pipefail
cd "$(dirname "$0")"
r() { docker compose run --rm -T restic "$@"; }
r cat config >/dev/null 2>&1 || r init
r backup /data/uploads --tag uploads --host hausmeister
r forget --tag uploads --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
r check --read-data-subset=1/30
