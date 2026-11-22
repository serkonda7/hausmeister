#!/usr/bin/env bash
# One-time hardening + Docker for a fresh Debian 13 VPS. Review before running!
#   sudo ./bootstrap.sh <admin-user>
# <admin-user> must already exist and have a working ~/.ssh/authorized_keys,
# because this disables password and root logins.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)"; exit 1; }
U=${1:?usage: bootstrap.sh <admin-user>}
H=$(getent passwd "$U" | cut -d: -f6)
[[ -s "$H/.ssh/authorized_keys" ]] || { echo "$U has no $H/.ssh/authorized_keys – aborting so you don't lock yourself out"; exit 1; }
. /etc/os-release; [[ "$VERSION_CODENAME" == trixie ]] || echo "WARN: expected Debian 13 (trixie), got $VERSION_CODENAME"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install unattended-upgrades apt-listchanges ufw ca-certificates curl git jq sudo
dpkg-reconfigure -f noninteractive unattended-upgrades
usermod -aG sudo "$U"

# SSH: keys only, no root.
cat > /etc/ssh/sshd_config.d/10-hausmeister.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
CONF
sshd -t && systemctl reload ssh

# Docker CE (official repo).
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker "$U"
cat > /etc/docker/daemon.json <<'CONF'
{ "log-driver": "local", "log-opts": { "max-size": "20m", "max-file": "5" } }
CONF
systemctl restart docker

# Firewall: nothing inbound except SSH (no app port is ever published).
# Close 22 once Tailscale SSH works: docs/infra-runbook.md step 6.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

# App directory (data is written by the container's uid 1000).
install -d -o "$U" -g "$U" /opt/hausmeister
echo
echo "Done. Next, as $U (log out/in for the docker group):"
echo "  git clone <repo> /opt/hausmeister && cd /opt/hausmeister/deploy"
echo "  mkdir -p data/db data/uploads ts-state && sudo chown -R 1000:1000 data"
