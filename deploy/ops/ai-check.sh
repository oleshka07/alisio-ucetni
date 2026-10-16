#!/bin/bash
# Stav AI rozpoznávání dokladů: poslední doklady a chyby z logu (klíče a e-maily maskované).
set -u
cd /root/projects/alisio-ucetni
mask() { sed -E 's/sk-[A-Za-z0-9_*.-]+/sk-***/g; s/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<email>/g'; }
echo "== poslední doklady"; sudo -u postgres psql -d alisio_ucetni -tA -F ' | ' -c 'select "createdAt"::timestamp(0), "aiStatus", "mimeType", "fileSize", source, ("docType" is not null) from "Document" order by "createdAt" desc limit 8'
echo "== chyby AI za 48 h"; journalctl -u alisio-ucetni --since "-48h" --no-pager -o cat | grep -iE -A4 'AI extraction failed|openai|429|quota|insufficient|invalid_api_key' | mask | tail -30
echo "== OPENAI_MODEL"; grep -E '^OPENAI_MODEL=' .env | cut -d= -f2- || echo "(výchozí)"
