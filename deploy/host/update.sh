#!/usr/bin/env bash
# One-command upgrade of a running deployment: pull, rebuild the app image,
# recreate the stack, then check the tailnet setup (docs/infra-runbook.md §7).
#   ./host/update.sh              upgrade to the current branch
#   ./host/update.sh --skip-pull  build and restart what is checked out (rollback)
# Expects /opt/hausmeister to be a git checkout; .env, data/ and ts-state/ are
# ignored by git and stay in place.
set -euo pipefail
self=$(readlink -f "$0")
cd "$(dirname "$self")/../.."

git rev-parse --git-dir >/dev/null 2>&1 \
  || { echo "not a git checkout: convert /opt/hausmeister first (docs/infra-runbook.md §7)" >&2; exit 1; }

if [[ "${1:-}" != "--skip-pull" ]]; then
  # Local changes would make the pull fail halfway; untracked files are fine.
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "working tree has local changes; commit or discard them first:" >&2
    git status --short --untracked-files=no >&2
    exit 1
  fi
  [[ -n "$(git symbolic-ref -q --short HEAD)" ]] \
    || { echo "detached HEAD; git switch <branch> first (rollback: ./host/update.sh --skip-pull)" >&2; exit 1; }

  # The pull can replace this script, so run the new version instead of the
  # rest of the old one.
  before=$(sha256sum "$self" | cut -d' ' -f1)
  echo "== pull"
  git fetch --prune origin
  git pull --ff-only
  if [[ "$(sha256sum "$self" | cut -d' ' -f1)" != "$before" ]]; then
    echo "update.sh changed, restarting it"
    exec "$self" --skip-pull
  fi
fi

cd deploy
if ! swapon --show=NAME --noheadings | grep -q .; then
  echo "warning: no active swap; builds can stall on a 1 GB VPS (see host/ensure-swap.sh)" >&2
fi
echo "== build $(git log -1 --format='%h %s')"
docker compose build --progress plain app
echo "== up"
docker compose up -d
echo "== check"
./check-tailnet.sh
