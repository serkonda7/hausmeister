#!/usr/bin/env bash
# Headroom for `docker compose build` on small VPSes: bun install and vite build
# can briefly exceed 1 GB, and without swap the OOM killer may take down a build
# step while `docker compose build` just appears to hang. Idempotent.
#   sudo ./ensure-swap.sh
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)"; exit 1; }

if swapon --show=NAME --noheadings | grep -qx '/swapfile'; then
  echo "/swapfile already active"
  exit 0
fi
if [[ -e /swapfile ]]; then
  echo "/swapfile exists but is not active; inspect it before retrying" >&2
  exit 1
fi

fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile >/dev/null
swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
swapon --show
