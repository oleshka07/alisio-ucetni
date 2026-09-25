#!/bin/bash
# Огляд сервера перед установкою. Нічого не змінює, секретів не друкує.
set -u
echo "== host"; hostname; uptime; df -h / | tail -1; free -h | head -2
echo "== ports"; ss -ltnp | awk 'NR>1{print $4, $6}' | sed 's/users:((//' | cut -c1-80
echo "== services"; for s in nginx caddy postgresql alisio-pms alisio-ucetni; do printf '%-15s %s\n' "$s" "$(systemctl is-active $s 2>/dev/null)"; done
echo "== tools"; for t in node npm psql git certbot nginx caddy; do printf '%-8s %s\n' "$t" "$(command -v $t || echo -)"; done; node -v 2>/dev/null; psql --version 2>/dev/null
echo "== nginx sites"; ls /etc/nginx/sites-enabled/ 2>/dev/null; ls /etc/caddy 2>/dev/null
echo "== projects"; ls /root/projects 2>/dev/null
echo "== pms unit"; systemctl cat alisio-pms 2>/dev/null | grep -E 'ExecStart|WorkingDirectory'
echo "== crontab (лише розклади)"; crontab -l 2>/dev/null | grep -v '^#' | grep . | awk '{print $1,$2,$3,$4,$5, $6}' | cut -c1-90
echo "== dns ucetni.rozum.one"; getent hosts ucetni.rozum.one || echo "не резолвиться"
echo "== public ip"; curl -s -4 --max-time 5 ifconfig.me; echo
