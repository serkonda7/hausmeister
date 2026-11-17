# Phase 0 runbook: infrastructure

Goal: a "Hallo" page at `https://sub.example.de` with a real certificate,
reachable only over Tailscale, with tested backups. See DESIGN.md §8.

`example.de` stays at Strato as it is, including its website and Strato mail. Only the
subdomain `sub` is delegated to **deSEC** by NS records (DESIGN §8.1).
Steps marked 🧑 are manual. Steps 1–3 need nothing but your laptop (with `curl`, `jq`, `dig`).

---

## 1. Zone `sub.example.de` at deSEC + restricted token (~5 min)

1. 🧑 Create a normal deSEC account at <https://desec.io> (no dedyn.io name needed).
2. On your laptop:
   ```sh
   deploy/host/desec-setup.sh sub.example.de --token
   ```
   This creates the zone `sub.example.de` with SPF `-all`, DMARC `reject` and null MX, and
   creates the Caddy token, which may **only** write `_acme-challenge.sub.example.de` TXT.
   Store the token in your password manager.
   (Later you can re-run it as `--token <VPS public IP>` for an IP-locked token, then
   delete the old one in the deSEC web UI.)

## 2. Delegate the subdomain at Strato 🧑

In Strato: _Domainverwaltung → example.de → Subdomains → `sub`_ (create it if needed)
_→ DNS → DNS server / NS records_: `ns1.desec.io` and `ns2.desec.org`.

- `sub` currently has its own A record at Strato (`203.0.113.10`). If Strato
  doesn't drop it automatically when you set the DNS servers, delete it.
- Leave everything on `example.de` itself (MX, DKIM, DMARC, website) untouched.
- If Strato offers to enter DS records for the subdomain, you can add the ones printed
  in step 1 later (DNSSEC, optional).

## 3. Verify

```sh
cd deploy && printf 'DOMAIN=sub.example.de\nDESEC_TOKEN=%s\n' 'the-token' > .env
./check-dns.sh --write-test
```

Everything must be green except "A", which comes in step 7. That includes "Strato
delegates sub.example.de", "1.1.1.1 resolves the test TXT" and "token is refused for
other records". Delegation changes can take up to an hour to show up.

## 4. Tailscale 🧑

1. Use the existing family tailnet (or create one at <https://login.tailscale.com>).
2. _Access controls_: paste `deploy/host/tailscale-policy.hujson`, fill in the
   real logins, save. The built-in `tests` must pass.
3. _Settings → Keys → Generate auth key_: **not** reusable, **pre-approved**, tags
   = `tag:hausmeister`, expiry 1 day. Use it in step 6.

## 5. VPS 🧑

1. Order a small **Strato VPS Linux** (2 vCPU / 2–4 GB is plenty) and choose
   **Debian 13** as the image. Set the root password in Strato's _Server-Login_ (or take
   it from the setup email) and note the public IPv4 address.
2. On your laptop, create an SSH key (skip this if you already have one) and install it for root.
   Strato logs you in as root with a password, and doesn't take a key when you order:
   ```sh
   ssh-keygen -t ed25519 -C "hausmeister-admin" -f ~/.ssh/strato_vps
   VPS=<public IP>
   ssh-copy-id -i ~/.ssh/strato_vps.pub root@$VPS     # asks for the root password
   ssh -i ~/.ssh/strato_vps root@$VPS
   ```
3. On the VPS, as root:
   ```sh
   apt-get update
   apt-get -y install sudo

   # Create non-root `admin` user
   adduser --gecos "" admin # set password
   usermod -aG sudo admin
   install -d -m 700 -o admin -g admin /home/admin/.ssh
   install -m 600 -o admin -g admin /root/.ssh/authorized_keys /home/admin/.ssh/authorized_keys

   # Must be first regular user (uid 1000)
   id admin

   exit
   ```
4. From laptop, check the login and sudo:
   ```sh
   ssh -t -i ~/.ssh/strato_vps admin@$VPS 'id; sudo -v && echo SUDO_OK'
   ```
   Enter admin's password. It must show `(sudo)` in the groups and `SUDO_OK`.
5. Copy and run the bootstrap script to disable password and root SSH:
   ```sh
   scp -i ~/.ssh/strato_vps deploy/host/bootstrap.sh admin@$VPS:
   ssh -t -i ~/.ssh/strato_vps admin@$VPS sudo ./bootstrap.sh admin
   ```
6. Get the code onto the VPS. There's no git remote yet, so use rsync:
   ```sh
   rsync -a -e "ssh -i ~/.ssh/strato_vps" --exclude node_modules --exclude .output ./ admin@$VPS:/opt/hausmeister/
   ```

## 6. Object storage + start the stack 🧑

1. In Backblaze B2, create a **private** bucket (e.g. `example-backup`, encryption on)
   and note its S3 endpoint (`s3.<region>.backblazeb2.com`).
   - Lifecycle settings: "Keep prior versions for this number of days" → 30. B2 only
     *hides* files that Litestream and `restic prune` delete; this purges them after
     30 days while still allowing recovery from an accidental or malicious delete.
2. Under *Application Keys*, create a key with access to **this bucket only**
   (read and write). keyID → `S3_ACCESS_KEY_ID`, applicationKey →
   `S3_SECRET_ACCESS_KEY`. The applicationKey is shown only once.
3. On the VPS:
   ```sh
   cd /opt/hausmeister/deploy
   cp .env.example .env && cp .env.backup.example .env.backup && chmod 600 .env .env.backup
   # fill in: DESEC_TOKEN, TS_AUTHKEY (DOMAIN is already sub.example.de)  /  S3_*, RESTIC_PASSWORD
   # (RESTIC_REPOSITORY and AWS_* are derived from S3_*; leave them as they are)
   # RESTIC_PASSWORD: generate one with `openssl rand -base64 32` and store it in the password manager
   mkdir -p data/db data/uploads ts-state && sudo chown -R 1000:1000 data
   docker compose up -d --build
   docker compose exec tailscale tailscale ip -4      # → 100.x.y.z
   ```
4. Remove `TS_AUTHKEY` from `.env` (the identity now lives in `ts-state/`).

## 7. Point the domain at the tailnet IP

On your laptop:

```sh
deploy/host/desec-setup.sh sub.example.de --a 100.x.y.z     # the IP from step 6
```

Then `./check-dns.sh` on the VPS: all green.

## 8. TLS: staging → production

1. Check that caddy got a certificate:
   ```sh
   docker compose logs -f --tail=100 caddy | grep --line-buffered -iE "certificate|error|failed"
   ```
2. From a device on the tailnet: `curl -k https://sub.example.de/health` → `{"ok":true,…}`
   (`-k` because staging certificates aren't trusted).
3. Switch to production: in `.env` add
   `ACME_CA=https://acme-v02.api.letsencrypt.org/directory`, then
   `docker compose up -d caddy`.
4. Open `https://sub.example.de` on a phone with Tailscale on: you should see "Hallo 👋"
   with a valid lock. With Tailscale off, the page must fail to load.

## 9. Backups + restore test

```sh
sudo deploy/host/install-timers.sh      # nightly restic 03:30, monthly restore test
sudo systemctl start hausmeister-backup       # first run creates the restic repo
./restore-test.sh                        # must end with "RESTORE TEST OK"
```

Store `.env`, `.env.backup` and a copy of `ts-state/` in your password manager or an encrypted backup.

**B2 transactions:** the free tier allows 2,500 Class C calls/day (mostly `ListObjectsV2`). Litestream's defaults (1s sync, 30s compaction, 15s L0 checks) generate far more and, once capped, B2 answers lists with 403 while Litestream retries in a tight loop. `deploy/litestream.yml` therefore widens those loops (sync every 15m, compaction 5m/1h/24h, L0 checks hourly). Keep Litestream retention enabled so old files are deleted (hidden in B2) and the 30-day lifecycle rule from step 6 can purge them — a small bucket also means fewer list pages. Check *Caps & Alerts → Class C → Today* in the B2 dashboard after a day. If the count is still close to 2,500, raise `sync-interval` further (e.g. to `30m`).

## 10. Enable Tailscale SSH on the host
1. ```sh
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up --ssh
   tailscale ip -4
   ```
2. From a tailnet device, verify (no `-i` key needed):
   ```sh
   ssh admin@<vps> 'id; hostname'
   ```

---

## Done when

- [ ] `check-dns.sh --write-test` is all green (sub.example.de delegated, token restricted)
- [ ] `https://sub.example.de` shows "Hallo" with a trusted Let's Encrypt certificate, from tailnet devices only
- [ ] `ssh admin@<host-tailnet-ip>` works from an admin's tailnet device without a key (Tailscale SSH), and is denied for non-admins
- [ ] Nothing is reachable on the VPS's public IP, including port 22 (`nmap -Pn VPS_PUBLIC_IP` from outside)
- [ ] Litestream is replicating (`docker compose logs litestream`, no errors)
- [ ] `restore-test.sh` passes, and both timers are listed in `systemctl list-timers 'hausmeister-*'`
- [ ] Secrets are stored in the password manager
