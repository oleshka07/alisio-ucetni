#!/bin/bash
# Прибрати тимчасовий пароль першого входу з .env (власник уже створений).
set -euo pipefail
cd /root/projects/alisio-ucetni
cp -p .env /root/backups/alisio-ucetni/env-before-clear-bootstrap.bak && chmod 600 /root/backups/alisio-ucetni/env-before-clear-bootstrap.bak
sed -i 's|^BOOTSTRAP_OWNER_PASSWORD=.*|BOOTSTRAP_OWNER_PASSWORD=""|' .env
grep -c '^BOOTSTRAP_OWNER_PASSWORD=""$' .env
sudo -u postgres psql -d alisio_ucetni -tAc 'select role, count(*) from "User" group by role'
systemctl restart alisio-ucetni; sleep 4; systemctl is-active alisio-ucetni
curl -s -o /dev/null -w "login %{http_code}\n" https://ucetni.rozum.one/login
