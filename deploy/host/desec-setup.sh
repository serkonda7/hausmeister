#!/usr/bin/env bash
# Sets up the app's zone at deSEC (DOMAIN = sub.example.de, delegated from Strato by NS).
# Run on your laptop (needs curl + jq). Safe to re-run.
#   desec-setup.sh DOMAIN                  create the zone, set SPF/DMARC/null MX, print NS + DS
#   desec-setup.sh DOMAIN --a 100.x.y.z    also set the A record (and remove any AAAA)
#   desec-setup.sh DOMAIN --token [IP]     also create the restricted Caddy token (optionally IP-locked)
# Logs in with your deSEC email/password; the login token is deleted on exit.
set -euo pipefail
D=${1:?usage: desec-setup.sh DOMAIN [--a IP] [--token [VPS_IP]]}; shift
A=""; MKTOKEN=0; TIP=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --a) A=${2:?--a needs an IP}; shift 2 ;;
    --token) MKTOKEN=1; shift; if [[ -n "${1:-}" && "$1" != --* ]]; then TIP=$1; shift; fi ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
done
command -v jq >/dev/null || { echo "needs jq"; exit 1; }
API=https://desec.io/api/v1

read -rp "deSEC email: " email; read -rsp "deSEC password: " pw; echo
login=$(curl -sf -X POST $API/auth/login/ -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$email" --arg p "$pw" '{email:$e,password:$p}')") || { echo "login failed"; exit 1; }
LT=$(jq -r .token <<<"$login"); LID=$(jq -r .id <<<"$login")
H=(-H "Authorization: Token $LT" -H 'Content-Type: application/json')
trap 'curl -s -X DELETE "${H[@]}" $API/auth/tokens/$LID/ >/dev/null' EXIT

# api METHOD PATH [curl args] → prints body, then the HTTP code on the last line
api() { local m=$1 p=$2; shift 2; curl -s -w '\n%{http_code}' -X "$m" "${H[@]}" "$API$p" "$@"; }
code() { printf '%s' "${1##*$'\n'}"; }
body() { printf '%s' "${1%$'\n'*}"; }
ok() { [[ "$(code "$1")" == "$2" ]] || { echo "✗ $3: HTTP $(code "$1") $(body "$1")"; exit 1; }; echo "✓ $3"; }

# 1. Zone
out=$(api GET "/domains/$D/")
if [[ "$(code "$out")" == 404 ]]; then
  ok "$(api POST /domains/ -d "$(jq -n --arg d "$D" '{name:$d}')")" 201 "zone $D created"
else
  ok "$out" 200 "zone $D exists"
fi

# 2. Records. Apex TXT is merged: other TXT values (e.g. site verifications) are kept.
txt=$(api GET "/domains/$D/rrsets/@/TXT/")
keep='[]'
[[ "$(code "$txt")" == 200 ]] && keep=$(body "$txt" | jq -c '[.records[] | select(startswith("\"v=spf1") | not)]')
sets=$(jq -n --argjson keep "$keep" '[
  {subname:"",       type:"TXT", ttl:3600, records:($keep + ["\"v=spf1 -all\""])},
  {subname:"_dmarc", type:"TXT", ttl:3600, records:["\"v=DMARC1; p=reject\""]},
  {subname:"",       type:"MX",  ttl:3600, records:["0 ."]}
]')
if [[ -n "$A" ]]; then
  sets=$(jq --arg a "$A" '. + [{subname:"",type:"A",ttl:3600,records:[$a]},
                               {subname:"",type:"AAAA",ttl:3600,records:[]}]' <<<"$sets")
fi
ok "$(api PATCH "/domains/$D/rrsets/" -d "$sets")" 200 "records: SPF -all, DMARC reject, null MX${A:+, A $A, no AAAA}"

# 3. Restricted token for Caddy: may write ONLY the TXT at _acme-challenge.$D
if [[ $MKTOKEN == 1 ]]; then
  subnets='["0.0.0.0/0","::/0"]'
  [[ -n "$TIP" ]] && subnets=$(jq -nc --arg ip "$TIP" '[$ip + (if ($ip|test(":")) then "/128" else "/32" end)]')
  out=$(api POST /auth/tokens/ -d "$(jq -n --argjson s "$subnets" \
    '{name:"hausmeister-caddy-acme", allowed_subnets:$s, perm_manage_tokens:false, perm_create_domain:false, perm_delete_domain:false}')")
  ok "$out" 201 "token created${TIP:+ (only usable from $TIP)}"
  TID=$(body "$out" | jq -r .id); TOKEN=$(body "$out" | jq -r .token)
  ok "$(api POST "/auth/tokens/$TID/policies/rrsets/" -d '{"domain":null,"subname":null,"type":null,"perm_write":false}')" \
     201 "token policy: no writes by default"
  ok "$(api POST "/auth/tokens/$TID/policies/rrsets/" -d "$(jq -n --arg d "$D" '{domain:$d,subname:"_acme-challenge",type:"TXT",perm_write:true}')")" \
     201 "token policy: may write _acme-challenge TXT"
  echo; echo "Put this into deploy/.env (and your password manager):"; echo "DESEC_TOKEN=$TOKEN"
fi

# 4. What to enter at Strato
echo
echo "At Strato, set the DNS servers for the subdomain ${D%%.*}:  ns1.desec.io  ns2.desec.org"
echo "Optional DNSSEC – DS records (only if Strato accepts DS records for the subdomain):"
body "$(api GET "/domains/$D/")" | jq -r '.keys[]?.ds[]?' | sed 's/^/  /'
