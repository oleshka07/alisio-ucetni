#!/bin/bash
# Додати в crontab root відсутні рядки з deploy/crontab.txt (наявні, зокрема PMS, не чіпає).
set -euo pipefail
cd /root/projects/alisio-ucetni
current=$(crontab -l 2>/dev/null || true)
added=0
while IFS= read -r line; do
  [[ -z "$line" || "$line" == \#* || "$line" == CRON_TZ=* ]] && continue
  if ! grep -qxF "$line" <<<"$current"; then current+=$'\n'"$line"; added=$((added+1)); fi
done < deploy/crontab.txt
if [ "$added" -gt 0 ]; then printf '%s\n' "$current" | crontab -; fi
echo "added: $added"
crontab -l | grep -c alisio-ucetni
bash deploy/cron.sh tax-calendar && echo "tax-calendar OK"
