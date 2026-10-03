#!/bin/bash
# Разові виправлення 3.10.2026:
# 1) KB EUR: виписки приходять у ту саму скриньку, що й CZK — синхронізація CZK розносить їх за номером рахунку.
#    Власний IMAP у EUR не потрібен → режим «ruční», помилка «IMAP není nastaven» зникне.
# 2) ID датової схранки фірми — з уже обробленого сповіщення ISDS (якщо в профілі порожньо).
set -euo pipefail
q() { sudo -u postgres psql -d alisio_ucetni -tA -F ' | ' -c "$1"; }
q "update \"BankAccount\" set source='manual', \"lastError\"=null, \"failCount\"=0 where id='cmuhmr6ya0001xjmd5yi5l5mi' and source='imap_camt' returning name, source"
q "select \"dataBoxId\", count(*) from \"DataBoxMessage\" group by \"dataBoxId\""
q "update \"CompanyProfile\" p set \"dataBox\" = m.\"dataBoxId\" from (select \"dataBoxId\" from \"DataBoxMessage\" where \"dataBoxId\" is not null group by \"dataBoxId\" having count(*) >= 1 limit 1) m where p.\"clientId\"='cmuhg80bf0000128pxrujnx9p' and p.\"dataBox\" is null returning p.\"dataBox\""
