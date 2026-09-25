#!/bin/bash
# Alisio Účetnictví — оновлення на сервері (запускається НА сервері або з GitHub Actions)
#   cd /root/projects/alisio-ucetni && bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "📥 git pull"
git fetch --quiet origin
git reset --hard origin/main

echo "📦 npm ci"
npm ci --no-audit --no-fund

echo "🗄  prisma migrate deploy"
npx prisma migrate deploy

echo "🔨 build"
npm run build

echo "♻️  restart"
systemctl restart alisio-ucetni
sleep 3
systemctl is-active --quiet alisio-ucetni && echo "✅ alisio-ucetni running" || (journalctl -u alisio-ucetni -n 50 --no-pager; exit 1)
