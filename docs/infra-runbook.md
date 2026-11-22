# Infrastructure runbook

Result: `https://hausmeister.<tailnet>.ts.net` with a trusted certificate, reachable only over Tailscale, with tested backups (DESIGN §8).

There is no public domain and no public DNS record. The name comes from Tailscale's **MagicDNS** and resolves only on tailnet devices; the certificate is a Let's Encrypt certificate that Tailscale obtains for the `*.ts.net` name. 🧑 = manual step in a web UI.

---

## 1. Tailscale 🧑

1. Use the family tailnet (or create one at <https://login.tailscale.com>).
2. _DNS_: check the **tailnet DNS name** (e.g. `tail1234.ts.net`). It is part of the app's URL, of every QR label and of every passkey. If you want a readable one, use _Rename tailnet…_ now: changing it later changes the URL and means new labels and new passkeys.
3. _DNS_: **Enable MagicDNS**, then under _HTTPS Certificates_ **Enable HTTPS**. Certificate names are published in the public Certificate Transparency logs, so `hausmeister.<tailnet>.ts.net` becomes publicly known (not reachable).
4. _Access controls_: paste `deploy/host/tailscale-policy.hujson`, replace the example logins, save. The built-in `tests` must pass.
5. _Settings → Keys → Generate auth key_: **not** reusable, **pre-approved**, tag `tag:hausmeister`, expiry 1 day. Needed in step 3.
6. _Machines_: if an old node already holds the name `hausmeister`, delete it, or the sidecar becomes `hausmeister-1`.

## 2. VPS

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

## 3. Object storage and stack

1. 🧑 Backblaze B2: create a **private** bucket (e.g. `example-backup`, encryption on) and note its endpoint `s3.<region>.backblazeb2.com`. Lifecycle: "Keep prior versions for this number of days" → **30** (B2 only hides what Litestream and `restic prune` delete; this purges it after 30 days and still allows recovery from a bad delete).
2. 🧑 _Application Keys_: create a read/write key for **this bucket only**. keyID → `S3_ACCESS_KEY_ID`, applicationKey → `S3_SECRET_ACCESS_KEY` (shown once).
3. VPS, as admin:
   ```sh
   cd /opt/hausmeister/deploy
   cp .env.example .env && cp .env.backup.example .env.backup && chmod 600 .env .env.backup
   sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 48)|" .env
   sed -i "s|^RESTIC_PASSWORD=.*|RESTIC_PASSWORD=$(openssl rand -base64 32)|" .env.backup
   nano .env          # DOMAIN=hausmeister.<tailnet DNS name from step 1>, TS_AUTHKEY
   nano .env.backup   # S3_* (leave RESTIC_REPOSITORY and AWS_* as they are)
   mkdir -p data/db data/uploads ts-state && sudo chown -R 1000:1000 data
   docker compose up -d --build
   ```
   Store `AUTH_SECRET` and `RESTIC_PASSWORD` in your password manager.
4. Remove `TS_AUTHKEY` from `.env` (the identity now lives in `ts-state/`):
   ```sh
   sed -i 's|^TS_AUTHKEY=.*|TS_AUTHKEY=|' .env
   ```

## 4. Check name and certificate

VPS, in `/opt/hausmeister/deploy`:

```sh
./check-tailnet.sh
```

It must be all green. It reads the node's MagicDNS name from the sidecar, checks that MagicDNS and HTTPS certificates are on and that `DOMAIN` matches, then fetches `/health` through Caddy with certificate verification. The first request can take up to a minute while Tailscale obtains the certificate; renewal is automatic. If `DOMAIN` was wrong, fix it in `.env` and run `docker compose up -d`.

On a phone with Tailscale on, `https://hausmeister.<tailnet>.ts.net` shows "Hallo 👋" with a valid lock. With Tailscale off it must not load (the name doesn't even resolve).

Devices only resolve the name while they use Tailscale's DNS (Android: _Tailscale → Settings → Use Tailscale DNS_ on). Users who get the node shared into their own tailnet need MagicDNS on in their tailnet; the name stays `hausmeister.<your tailnet>.ts.net`.

## 5. Backups and restore test

VPS, in `/opt/hausmeister/deploy`:

```sh
sudo host/install-timers.sh               # nightly restic 03:30, monthly restore test
sudo systemctl start hausmeister-backup   # first run creates the restic repo
./restore-test.sh                         # must end with "RESTORE TEST OK"
```

Store `.env`, `.env.backup` and a copy of `ts-state/` in your password manager or an encrypted backup. `ts-state/` holds the node identity and with it the name: if it is lost, the sidecar must be re-added with a new auth key and the old node deleted first (step 1.6), or the URL changes.

**B2 free tier**: 2,500 Class C transactions/day (mostly `ListObjectsV2`). Litestream's defaults far exceed that, and once capped B2 answers 403 while Litestream retries in a tight loop. `deploy/litestream.yml` therefore widens the intervals (sync 15m, compaction 5m/1h/24h, L0 checks hourly). Keep Litestream retention on so old files get deleted and the 30-day lifecycle rule purges them. After a day, check _Caps & Alerts → Class C → Today_; if it is still near 2,500, raise `sync-interval` (e.g. `30m`).

## 6. Tailscale SSH on the host, then close port 22

1. VPS (the host gets its own node name, so it never takes `hausmeister` from the sidecar):
   ```sh
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up --ssh --hostname hausmeister-host
   ```
2. From a tailnet device (no key needed):
   ```sh
   ssh admin@hausmeister-host 'id; hostname'
   ```
3. Once that works, close public SSH (`bootstrap.sh` allowed it). Over Tailscale SSH:
   ```sh
   sudo ufw delete allow OpenSSH && sudo ufw status
   ```

---

## Moving from the old deSEC setup

Only if an instance already ran on the custom domain (`sub.example.de`, DNS-01 via deSEC):

1. Do steps 1.2, 1.3 and 1.6, then on the VPS set `DOMAIN` in `.env` to the MagicDNS name, delete the `DESEC_TOKEN` and `ACME_CA` lines and run `docker compose up -d` (Caddy now runs the stock image). Then step 4.
2. The origin changed, so everyone signs in again and re-adds passkeys (the passkey RP ID is the host name; old passkeys stop working). Reinstall the PWA from the new URL.
3. Printed QR labels encode the old URL. The in-app scanner still reads them (it only takes the short code), but the phone's camera app opens the dead old address: reprint them over time from `/labels`.
4. Clean up: delete the zone and both tokens at deSEC, remove the NS records for `sub` at Strato, and `docker image rm hausmeister-caddy:2.11.9`.

---

## Done when

- [ ] `./check-tailnet.sh` is all green
- [ ] `https://hausmeister.<tailnet>.ts.net` shows "Hallo" with a trusted Let's Encrypt certificate, from tailnet devices only
- [ ] `ssh admin@hausmeister-host` works from an admin's tailnet device without a key and is denied for non-admins
- [ ] Nothing answers on the VPS's public IP, including port 22: `nmap -Pn <VPS public IP>` from outside
- [ ] `docker compose logs litestream` shows replication without errors
- [ ] `./restore-test.sh` passes and `systemctl list-timers 'hausmeister-*'` lists both timers
- [ ] Secrets are in the password manager
