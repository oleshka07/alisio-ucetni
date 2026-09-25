#!/bin/bash
# Стан налаштування і синхронізації. E-mail адреси й тексти помилок маскуються (логи Actions публічні).
set -u
cd /root/projects/alisio-ucetni
mask() { sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<email>/g; s#//[^@ ]*@#//***@#g'; }
q() { sudo -u postgres psql -d alisio_ucetni -tA -F ' | ' -c "$1" 2>&1 | mask; }
echo "== clients";      q 'select type, (ico is not null) as ico, (dic is not null) as dic, ("dataBox" is not null) as databox from "Client"'
echo "== users";        q 'select role, ("telegramChatId" is not null) as telegram, "isActive" from "User"'
echo "== bank accounts (перед sync)"; q 'select name, source, "isActive", "lastSyncAt", left(coalesce("lastError",''-''),160) from "BankAccount"'
echo "== inboxes (перед sync)";       q 'select name, kind, "isActive", "lastSyncAt", left(coalesce("lastError",''-''),160) from "DocumentInbox"'
echo "== run sync"; bash deploy/cron.sh sync 2>&1 | mask | tail -3; echo "exit ${PIPESTATUS[0]}"
echo "== bank accounts (після)"; q 'select name, "lastSyncAt", left(coalesce("lastError",''-''),160) from "BankAccount"'
echo "== inboxes (після)";       q 'select name, "lastSyncAt", left(coalesce("lastError",''-''),160) from "DocumentInbox"'
echo "== counts"; q 'select (select count(*) from "Transaction") tx, (select count(*) from "Document") docs, (select count(*) from "DataBoxMessage") databox, (select count(*) from "Task") tasks'
echo "== cron log (помилки)"; grep -icE 'error|fail|curl:' /var/log/alisio-ucetni-cron.log 2>/dev/null; tail -5 /var/log/alisio-ucetni-cron.log 2>/dev/null | mask
echo "== app log: errors за 3 год"; journalctl -u alisio-ucetni --since "-3h" --no-pager -o cat | grep -iE 'error|⨯|warn' | grep -v EADDRINUSE | tail -15 | mask
