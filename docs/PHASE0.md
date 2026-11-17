# Phase 0 runbook: infrastructure

Result: `https://sub.example.de` with a trusted certificate, reachable only over Tailscale, with tested backups (DESIGN §8).

Only the subdomain `sub` moves to **deSEC** (NS delegation); `example.de`, its website and Strato mail stay as they are. 🧑 = manual step in a web UI. Steps 1–3 run on your laptop and need `curl`, `jq` and `dig`.

---

## 1. deSEC zone and restricted token (~5 min)

1. 🧑 Create a deSEC account at <https://desec.io> (no dedyn.io name needed).
2. Create the zone (SPF `-all`, DMARC `reject`, null MX) and the Caddy token, which may **only** write `_acme-challenge.sub.example.de` TXT:
   ```sh
   deploy/host/desec-setup.sh sub.example.de --token
   ```
   Store the token in your password manager. Optional, once the VPS exists: `--token <VPS public IP>` creates an IP-locked token; then delete the old one in the deSEC UI.

## 2. Delegate the subdomain at Strato 🧑

_Domainverwaltung → example.de → Subdomains → `sub`_ (create it if missing) _→ DNS → NS records_: `ns1.desec.io`, `ns2.desec.org`.

- Delete `sub`'s old A record (`203.0.113.10`) if Strato keeps it.
- Leave everything on `example.de` itself (MX, DKIM, DMARC, website) untouched.
- Optional (DNSSEC): add the DS records printed in step 1, if Strato offers it.

## 3. Verify DNS

```sh
cd deploy
printf 'DOMAIN=sub.example.de\nDESEC_TOKEN=%s\n' '<the token>' > .env
./check-dns.sh --write-test
```

Everything must be green except "A" (step 7). Delegation can take up to an hour.

## 4. Tailscale 🧑

1. Use the family tailnet (or create one at <https://login.tailscale.com>).
2. _Access controls_: paste `deploy/host/tailscale-policy.hujson`, replace the example logins, save. The built-in `tests` must pass.
3. _Settings → Keys → Generate auth key_: **not** reusable, **pre-approved**, tag `tag:hausmeister`, expiry 1 day. Needed in step 6.

## 5. VPS

1. 🧑 Order a **Strato VPS Linux** (2 vCPU / 2–4 GB) with **Debian 13**. Set the root password under _Server-Login_ (or take it from the setup email) and note the public IPv4.
2. Laptop: create an SSH key (skip if you have one) and install it for root:
   ```sh
   ssh-keygen -t ed25519 -C "hausmeister-admin" -f ~/.ssh/strato_vps
   VPS=<public IP>
   ssh-copy-id -i ~/.ssh/strato_vps.pub root@$VPS     # asks for the root password
   ssh -i ~/.ssh/strato_vps root@$VPS
   ```
3. VPS, as root: create the `admin` user (must get uid 1000):
   ```sh
   apt-get update && apt-get -y install sudo
   adduser --gecos "" admin          # set a password
   usermod -aG sudo admin
   install -d -m 700 -o admin -g admin /home/admin/.ssh
   install -m 600 -o admin -g admin /root/.ssh/authorized_keys /home/admin/.ssh/authorized_keys
   id admin                          # uid=1000
   exit
   ```
4. Laptop: check login and sudo (enter admin's password). Expect `(sudo)` in the groups and `SUDO_OK`:
   ```sh
   ssh -t -i ~/.ssh/strato_vps admin@$VPS 'id; sudo -v && echo SUDO_OK'
   ```
5. Laptop: run the bootstrap (installs Docker, ufw, unattended-upgrades; disables password and root SSH):
   ```sh
   scp -i ~/.ssh/strato_vps deploy/host/bootstrap.sh admin@$VPS:
   ssh -t -i ~/.ssh/strato_vps admin@$VPS sudo ./bootstrap.sh admin
   ```
6. Laptop: copy the code (no git remote yet):
   ```sh
   rsync -a -e "ssh -i ~/.ssh/strato_vps" --exclude node_modules --exclude .output ./ admin@$VPS:/opt/hausmeister/
   ```

## 6. Object storage and stack

1. 🧑 Backblaze B2: create a **private** bucket (e.g. `example-backup`, encryption on) and note its endpoint `s3.<region>.backblazeb2.com`. Lifecycle: "Keep prior versions for this number of days" → **30** (B2 only hides what Litestream and `restic prune` delete; this purges it after 30 days and still allows recovery from a bad delete).
2. 🧑 _Application Keys_: create a read/write key for **this bucket only**. keyID → `S3_ACCESS_KEY_ID`, applicationKey → `S3_SECRET_ACCESS_KEY` (shown once).
3. VPS, as admin:
   ```sh
   cd /opt/hausmeister/deploy
   cp .env.example .env && cp .env.backup.example .env.backup && chmod 600 .env .env.backup
   sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 48)|" .env
   sed -i "s|^RESTIC_PASSWORD=.*|RESTIC_PASSWORD=$(openssl rand -base64 32)|" .env.backup
   nano .env          # DESEC_TOKEN, TS_AUTHKEY
   nano .env.backup   # S3_* (leave RESTIC_REPOSITORY and AWS_* as they are)
   mkdir -p data/db data/uploads ts-state && sudo chown -R 1000:1000 data
   docker compose up -d --build
   docker compose exec tailscale tailscale ip -4      # → 100.x.y.z
   ```
   Store `AUTH_SECRET` and `RESTIC_PASSWORD` in your password manager.
4. Remove `TS_AUTHKEY` from `.env` (the identity now lives in `ts-state/`):
   ```sh
   sed -i 's|^TS_AUTHKEY=.*|TS_AUTHKEY=|' .env
   ```

## 7. Point the domain at the tailnet IP

Laptop:

```sh
deploy/host/desec-setup.sh sub.example.de --a 100.x.y.z     # IP from step 6
```

VPS: `./check-dns.sh` must be all green.

## 8. TLS: staging → production

VPS, in `/opt/hausmeister/deploy`:

1. Check that Caddy got a (staging) certificate:
   ```sh
   docker compose logs -f --tail=100 caddy | grep --line-buffered -iE "certificate|error|failed"
   ```
2. From a tailnet device (`-k`: staging certificates aren't trusted):
   ```sh
   curl -k https://sub.example.de/health    # → {"ok":true,…}
   ```
3. Switch to production:
   ```sh
   echo 'ACME_CA=https://acme-v02.api.letsencrypt.org/directory' >> .env
   docker compose up -d caddy
   ```
4. On a phone with Tailscale on, `https://sub.example.de` shows "Hallo 👋" with a valid lock. With Tailscale off it must not load.

## 9. Backups and restore test

VPS, in `/opt/hausmeister/deploy`:

```sh
sudo host/install-timers.sh               # nightly restic 03:30, monthly restore test
sudo systemctl start hausmeister-backup   # first run creates the restic repo
./restore-test.sh                         # must end with "RESTORE TEST OK"
```

Store `.env`, `.env.backup` and a copy of `ts-state/` in your password manager or an encrypted backup.

**B2 free tier**: 2,500 Class C transactions/day (mostly `ListObjectsV2`). Litestream's defaults far exceed that, and once capped B2 answers 403 while Litestream retries in a tight loop. `deploy/litestream.yml` therefore widens the intervals (sync 15m, compaction 5m/1h/24h, L0 checks hourly). Keep Litestream retention on so old files get deleted and the 30-day lifecycle rule purges them. After a day, check _Caps & Alerts → Class C → Today_; if it is still near 2,500, raise `sync-interval` (e.g. `30m`).

## 10. Tailscale SSH on the host, then close port 22

1. VPS:
   ```sh
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up --ssh
   tailscale ip -4
   ```
2. From a tailnet device (no key needed):
   ```sh
   ssh admin@<host tailnet IP> 'id; hostname'
   ```
3. Once that works, close public SSH (`bootstrap.sh` allowed it). Over Tailscale SSH:
   ```sh
   sudo ufw delete allow OpenSSH && sudo ufw status
   ```

---

## Done when

- [ ] `./check-dns.sh --write-test` is all green
- [ ] `https://sub.example.de` shows "Hallo" with a trusted Let's Encrypt certificate, from tailnet devices only
- [ ] `ssh admin@<host tailnet IP>` works from an admin's tailnet device without a key and is denied for non-admins
- [ ] Nothing answers on the VPS's public IP, including port 22: `nmap -Pn <VPS public IP>` from outside
- [ ] `docker compose logs litestream` shows replication without errors
- [ ] `./restore-test.sh` passes and `systemctl list-timers 'hausmeister-*'` lists both timers
- [ ] Secrets are in the password manager
