#!/usr/bin/env bash
# Checks the tailnet setup (DESIGN §8.1): MagicDNS and HTTPS certificates are on,
# DOMAIN in ./.env is the sidecar's MagicDNS name, and Caddy serves /health with
# a trusted certificate. Run on the VPS in /opt/hausmeister/deploy (needs jq).
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] && set -a && . ./.env && set +a

ok=0; bad=0
pass() { printf '  \e[32m✓\e[0m %s\n' "$*"; ok=$((ok+1)); }
fail() { printf '  \e[31m✗\e[0m %s\n' "$*"; bad=$((bad+1)); }

ST=$(docker compose exec -T tailscale tailscale status --json) || { echo "tailscale container not running (docker compose up -d)"; exit 1; }
NAME=$(jq -r '.Self.DNSName | rtrimstr(".")' <<<"$ST")
IP=$(jq -r '[.Self.TailscaleIPs[] | select(test("^100\\."))][0] // ""' <<<"$ST")

echo "Tailnet:"
[[ "$(jq -r '.BackendState' <<<"$ST")" == Running ]] && pass "node is logged in ($IP)" || fail "node not running (TS_AUTHKEY expired or not set?)"
[[ "$(jq -r '.CurrentTailnet.MagicDNSEnabled // false' <<<"$ST")" == true ]] && pass "MagicDNS on" \
  || fail "MagicDNS off (admin console → DNS → Enable MagicDNS)"
jq -e --arg n "$NAME" '(.CertDomains // []) | index($n)' <<<"$ST" >/dev/null && pass "HTTPS certificates on for $NAME" \
  || fail "HTTPS certificates off (admin console → DNS → HTTPS Certificates → Enable)"
[[ "$NAME" == hausmeister.* ]] && pass "node name $NAME" \
  || fail "node is called $NAME, not hausmeister.… (an old node holds the name? delete it, then restart the sidecar)"

echo "App:"
if [[ "${DOMAIN:-}" == "$NAME" ]]; then pass "DOMAIN matches"
else fail "DOMAIN is '${DOMAIN:-}', set DOMAIN=$NAME in .env and run: docker compose up -d"; fi
# Ask Caddy inside the sidecar's network namespace; curl verifies the certificate.
CID=$(docker compose ps -q tailscale)
H=$(docker run --rm --network "container:$CID" curlimages/curl:8.11.1 -sS --max-time 60 \
      --resolve "$NAME:443:127.0.0.1" "https://$NAME/health" 2>&1) || true
grep -q '"ok":true' <<<"$H" && pass "https://$NAME/health answers with a trusted certificate" \
  || fail "https://$NAME/health: ${H:-no answer} (docker compose logs caddy tailscale)"

echo; echo "$ok ok, $bad problems"; [[ $bad -eq 0 ]]
