#!/bin/bash
# Звільнити місце: лише кеші й старі системні логи. Бази, образи, контейнери, бекапи, код — не чіпає.
set -u
echo "before: $(df -h / | tail -1)"
docker builder prune -af 2>&1 | tail -1
journalctl --vacuum-size=300M 2>&1 | tail -1
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/size.conf && systemctl restart systemd-journald
npm cache clean --force 2>/dev/null; rm -rf /root/.npm/_npx
rm -rf /root/.cache/pypoetry
apt-get clean
echo "after:  $(df -h / | tail -1)"
for s in alisio-ucetni alisio-pms nginx postgresql docker; do printf '%-14s %s\n' "$s" "$(systemctl is-active $s)"; done
docker ps --format '{{.Names}} {{.Status}}'
