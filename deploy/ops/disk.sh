#!/bin/bash
# Що займає диск. Нічого не видаляє.
set -u
df -h / | tail -1
echo "== top /"; du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -12
echo "== top /root"; du -xh --max-depth=2 /root 2>/dev/null | sort -rh | head -15
echo "== top /var"; du -xh --max-depth=2 /var 2>/dev/null | sort -rh | head -12
echo "== journal"; journalctl --disk-usage
echo "== npm cache"; du -sh /root/.npm 2>/dev/null
echo "== apt cache"; du -sh /var/cache/apt 2>/dev/null
echo "== docker"; command -v docker >/dev/null && { docker system df; docker ps --format '{{.Names}} {{.Image}} {{.Status}}'; }
echo "== backups"; du -sh /root/backups/* 2>/dev/null
echo "== big files >300M"; find / -xdev -type f -size +300M -printf '%s\t%p\n' 2>/dev/null | sort -rn | head -15 | awk '{printf "%.1fG\t%s\n",$1/1e9,$2}'
