#!/bin/bash
# Виклик фонової задачі застосунку: bash deploy/cron.sh sync|digest|reminders
# Читає CRON_SECRET з .env, щоб ключ не світився в crontab.
set -euo pipefail
cd "$(dirname "$0")/.."
JOB="${1:?job name}"
SECRET=$(grep -E '^CRON_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '"')
curl -fsS -m 170 -H "Authorization: Bearer ${SECRET}" "http://127.0.0.1:3002/api/cron/${JOB}" > /dev/null
