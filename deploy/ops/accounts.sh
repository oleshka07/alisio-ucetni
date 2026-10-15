#!/bin/bash
# Účty a firmy, ke kterým patří; počty výpisů a plateb podle firmy (bez osobních údajů).
set -u
q() { sudo -u postgres psql -d alisio_ucetni -tA -F ' | ' -c "$1"; }
echo "== účty"; q 'select b.id, b.name, b.currency, b."accountNumber", c.name, b.source, b."createdAt"::date from "BankAccount" b join "Client" c on c.id=b."clientId" order by b."createdAt"'
echo "== platby: účet → firma platby"; q 'select b.name, cb.name as firma_uctu, ct.name as firma_platby, count(*) from "Transaction" t join "BankAccount" b on b.id=t."bankAccountId" join "Client" cb on cb.id=b."clientId" join "Client" ct on ct.id=t."clientId" group by 1,2,3 order by 1'
echo "== výpisy"; q 'select b.name, s.source, s."fileName" is not null, s."periodFrom"::date, s."periodTo"::date, s."txCount", s."importedCount", s."createdAt" from "BankStatement" s join "BankAccount" b on b.id=s."bankAccountId" order by s."createdAt"'
echo "== audit (účty)"; q $'select "createdAt", action, left(details::text,160) from "AuditLog" where action ilike \'%bank%\' order by "createdAt" desc limit 15' 2>/dev/null || true
