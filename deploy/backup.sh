#!/bin/bash
# Щоденний бекап: pg_dump + архів файлів документів. Зберігає 30 днів.
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="/root/backups/alisio-ucetni"
KEEP_DAYS=30
TS=$(date +%Y-%m-%d_%H%M)
mkdir -p "$BACKUP_DIR"

DB_URL=$(grep -E '^POSTGRES_URL_NON_POOLING=' .env | head -1 | cut -d= -f2- | tr -d '"')
FILES_DIR=$(grep -E '^FILES_DIR=' .env | head -1 | cut -d= -f2- | tr -d '"')

pg_dump "$DB_URL" | gzip > "$BACKUP_DIR/db_${TS}.sql.gz"
[ -n "$FILES_DIR" ] && [ -d "$FILES_DIR" ] && tar -czf "$BACKUP_DIR/files_${TS}.tar.gz" -C "$FILES_DIR" .

find "$BACKUP_DIR" -type f -mtime +$KEEP_DAYS -delete
echo "✅ $(date) backup: $(du -sh "$BACKUP_DIR" | cut -f1) total"
