#!/bin/bash
# Приймальна перевірка на сервері. Значень секретів не друкує — лише "є / порожньо".
set -u
cd /root/projects/alisio-ucetni
echo "== services"; for s in alisio-ucetni alisio-pms nginx postgresql; do printf '%-14s %s\n' "$s" "$(systemctl is-active $s)"; done
echo "== commit"; git log --oneline -1
echo "== https"; curl -s -o /dev/null -w "login %{http_code}, ssl_verify=%{ssl_verify_result}\n" https://ucetni.rozum.one/login
curl -s -o /dev/null -w "pms-port-3001 %{http_code}\n" http://127.0.0.1:3001/ || true
echo "== .env (є/порожньо)"
for k in APP_URL AUTH_SECRET ENCRYPTION_KEY CRON_SECRET FILES_DIR OPENAI_API_KEY TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME TELEGRAM_WEBHOOK_SECRET BOOTSTRAP_OWNER_EMAIL BOOTSTRAP_OWNER_PASSWORD; do
  v=$(grep -E "^$k=" .env | head -1 | cut -d= -f2- | tr -d '"')
  case "$v" in ""|"openssl rand -hex 32"|тимчасовий*) s="ПОРОЖНЬО/шаблон";; *) s="є (${#v} симв.)";; esac
  printf '%-26s %s\n' "$k" "$s"
done
grep -E '^APP_URL=' .env
echo "== db"; sudo -u postgres psql -d alisio_ucetni -tAc 'select count(*) || '"' users'"' from "User"'
echo "== cron"; crontab -l | grep -c alisio-ucetni
echo "== sync (ручний прогін)"; bash deploy/cron.sh sync 2>&1 | tail -3; echo "sync exit ${PIPESTATUS[0]}"
echo "== backup"; bash deploy/backup.sh 2>&1 | sed -E 's#//[^@ ]*@#//***@#g' | tail -3; ls -la /root/backups/alisio-ucetni 2>/dev/null | tail -3
echo "== files dir"; ls -ld /var/lib/alisio-ucetni/files
echo "== app log (20)"; journalctl -u alisio-ucetni -n 20 --no-pager -o cat
echo "== disk"; df -h / | tail -1
