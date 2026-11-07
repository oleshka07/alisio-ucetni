#!/bin/bash
# Jednorázově rozřadit nepřiřazené doklady (jako tlačítko „Rozřadit znovu“). Tiskne jen počty — logy jsou veřejné.
set -euo pipefail
cd /root/projects/alisio-ucetni
SECRET=$(grep -E '^CRON_SECRET=' .env | head -1 | cut -d= -f2- | tr -d '"')
curl -fsS -m 600 -H "Authorization: Bearer ${SECRET}" "http://127.0.0.1:3012/api/cron/resort" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).resort;console.log({checked:r.checked,statements:r.statements,transactions:r.transactions,recognized:r.recognized,companyDocs:r.companyDocs,linked:r.linked,notes:r.notes.length})})'
