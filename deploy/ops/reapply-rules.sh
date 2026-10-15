#!/bin/bash
# Перерахувати правила «який документ потрібен» для всіх платежів (після зміни системних правил).
set -eu
cd /root/projects/alisio-ucetni
SECRET=$(grep -E '^CRON_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '"')
curl -fsS -m 170 -H "Authorization: Bearer ${SECRET}" "http://127.0.0.1:3012/api/cron/rules"; echo
sudo -u postgres psql -d alisio_ucetni -tA -F ' | ' -c 'select category, "docStatus", count(*) from "Transaction" group by 1,2 order by 1,2'
