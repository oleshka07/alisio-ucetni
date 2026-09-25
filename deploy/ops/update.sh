#!/bin/bash
# Оновити застосунок з main і перевірити, що редірект веде на публічний домен.
set -euo pipefail
cd /root/projects/alisio-ucetni
bash deploy/deploy.sh 2>&1 | grep -E '📥|HEAD|migrat|✓ Compiled|✅|rror' || true
systemctl is-active alisio-ucetni
curl -s -o /dev/null -w "redirect -> %{redirect_url}\n" https://ucetni.rozum.one/dashboard
