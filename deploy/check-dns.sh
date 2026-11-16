#!/usr/bin/env bash
# Checks the DNS setup: DOMAIN (sub.example.de) delegated from Strato to deSEC, see DESIGN §8.1.
#   ./check-dns.sh                 read-only checks
#   ./check-dns.sh --write-test    also writes a test TXT with DESEC_TOKEN and resolves it
# Reads DOMAIN and DESEC_TOKEN from ./.env (or the environment).
# Records are checked at ns1.desec.io directly, so this works before the delegation too.
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] && set -a && . ./.env && set +a
: "${DOMAIN:?DOMAIN not set}"
AUTH=ns1.desec.io

ok=0; bad=0
pass() { printf '  \e[32m✓\e[0m %s\n' "$*"; ok=$((ok+1)); }
fail() { printf '  \e[31m✗\e[0m %s\n' "$*"; bad=$((bad+1)); }
info() { printf '  - %s\n' "$*"; }
q() { dig +short "$@" | sed 's/\.$//' | sort | paste -sd' ' ; }

echo "Delegation:"
PARENT=${DOMAIN#*.}
PNS=$(q NS "$PARENT" @1.1.1.1 | cut -d' ' -f1)
REF=$(dig +norec NS "$DOMAIN" @"$PNS" | awk '$4=="NS"{print $5}' | sed 's/\.$//' | sort | paste -sd' ')
[[ "$REF" == *desec* ]] && pass "Strato ($PNS) delegates $DOMAIN to: $REF" \
  || fail "Strato ($PNS) doesn't delegate $DOMAIN yet (got '${REF:-nothing}'); set DNS servers ns1.desec.io ns2.desec.org for the subdomain"
NS=$(q NS "$DOMAIN" @1.1.1.1)
DELEGATED=""
if [[ "$NS" == *desec* ]]; then pass "public resolvers see nameservers: $NS"; DELEGATED=1
else fail "1.1.1.1 sees nameservers '${NS:-none}' (delegation not live yet?)"; fi
SOA=$(dig +short SOA "$DOMAIN" @$AUTH)
[[ -n "$SOA" ]] && pass "deSEC serves the zone" || fail "deSEC doesn't serve $DOMAIN yet (run host/desec-setup.sh)"
if [[ -n "$(dig +short DS "$DOMAIN" @1.1.1.1)" ]]; then
  dig +dnssec "$DOMAIN" SOA @1.1.1.1 | grep -q ' ad[ ;]' && pass "DNSSEC validates" || fail "DS is set but DNSSEC doesn't validate (wrong DS at Strato?)"
else info "DNSSEC not enabled (optional)"; fi

echo "Records (asked $AUTH directly):"
A=$(q A "$DOMAIN" @$AUTH)
if [[ "$A" =~ ^100\.[0-9.]+$ ]]; then pass "A $A (tailnet IP)"
elif [[ -z "$A" ]]; then fail "no A record yet (desec-setup.sh DOMAIN --a <tailnet IP>)"
else fail "A is '$A', expected the 100.x tailnet IP of node hausmeister"; fi
AAAA=$(q AAAA "$DOMAIN" @$AUTH)
[[ -z "$AAAA" ]] && pass "no AAAA" || fail "AAAA present ($AAAA): delete it"
TXT=$(dig +short TXT "$DOMAIN" @$AUTH)
grep -q '"v=spf1 -all"' <<<"$TXT" && pass "SPF v=spf1 -all" || fail "SPF missing (want TXT \"v=spf1 -all\")"
DM=$(dig +short TXT "_dmarc.$DOMAIN" @$AUTH)
grep -q 'p=reject' <<<"$DM" && pass "DMARC p=reject" || fail "DMARC missing (want _dmarc TXT \"v=DMARC1; p=reject\")"
MX=$(q MX "$DOMAIN" @$AUTH)
[[ "$MX" == "0 " || "$MX" == "0 ." ]] && pass "null MX" || fail "MX is '${MX:-none}', expected null MX (0 .)"

if [[ "${1:-}" == "--write-test" ]]; then
  : "${DESEC_TOKEN:?DESEC_TOKEN not set}"
  echo "Write test with the Caddy token:"
  val="hausmeister-test-$(date +%s)"
  api="https://desec.io/api/v1/domains/$DOMAIN/rrsets/"
  set_txt() { curl -s -o /dev/null -w '%{http_code}' -X PATCH "$api" -H "Authorization: Token $DESEC_TOKEN" \
                -H 'Content-Type: application/json' \
                -d "[{\"subname\":\"_acme-challenge\",\"type\":\"TXT\",\"ttl\":3600,\"records\":[$1]}]"; }
  c=$(set_txt "\"\\\"$val\\\"\"")
  [[ "$c" == 200 ]] && pass "token can write _acme-challenge TXT" || fail "write returned HTTP $c"
  c=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$api" -H "Authorization: Token $DESEC_TOKEN" \
        -H 'Content-Type: application/json' -d '[{"subname":"hausmeister-test","type":"TXT","ttl":3600,"records":["\"x\""]}]')
  [[ "$c" == 403 ]] && pass "token is refused for other records (HTTP 403)" || fail "token wrote/tried another record: HTTP $c (expected 403)"
  resolvers=($AUTH); [[ -n "$DELEGATED" ]] && resolvers+=(1.1.1.1)
  for r in "${resolvers[@]}"; do
    found=""
    for i in $(seq 1 24); do
      dig +short TXT "_acme-challenge.$DOMAIN" @"$r" | grep -q "$val" && { found=1; break; }
      sleep 5
    done
    [[ -n "$found" ]] && pass "$r resolves the test TXT" || fail "$r doesn't show the test TXT after 2 min"
  done
  [[ -z "$DELEGATED" ]] && info "public-resolver check skipped until the delegation is live"
  set_txt "" >/dev/null && info "test record removed"
fi

echo; echo "$ok ok, $bad problems"; [[ $bad -eq 0 ]]
