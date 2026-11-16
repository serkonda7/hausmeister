#!/usr/bin/env bash
# Installs nightly upload backup + monthly restore test as systemd timers.
#   sudo ./install-timers.sh   (expects the repo at /opt/hausmeister)
set -euo pipefail
D=/opt/hausmeister/deploy
cat > /etc/systemd/system/hausmeister-backup.service <<UNIT
[Unit]
Description=Hausmeister restic backup of uploads
After=docker.service
[Service]
Type=oneshot
WorkingDirectory=$D
ExecStart=$D/backup-uploads.sh
UNIT
cat > /etc/systemd/system/hausmeister-backup.timer <<'UNIT'
[Unit]
Description=Nightly Hausmeister upload backup
[Timer]
OnCalendar=*-*-* 03:30:00 Europe/Berlin
RandomizedDelaySec=15m
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/hausmeister-restore-test.service <<UNIT
[Unit]
Description=Hausmeister monthly restore test
After=docker.service hausmeister-backup.service
[Service]
Type=oneshot
WorkingDirectory=$D
ExecStart=$D/restore-test.sh
UNIT
cat > /etc/systemd/system/hausmeister-restore-test.timer <<'UNIT'
[Unit]
Description=Monthly Hausmeister restore test
[Timer]
OnCalendar=*-*-01 05:00:00 Europe/Berlin
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now hausmeister-backup.timer hausmeister-restore-test.timer
systemctl list-timers 'hausmeister-*'
