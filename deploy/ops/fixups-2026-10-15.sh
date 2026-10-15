#!/bin/bash
# Účet „QA EUR Cesca Sporitelna“ byl založen u Swipe Scape → přesunout k QA Glamping i s platbami (stejně jako lib/bank/move-account.ts).
set -eu
ACC=cmv7uuuv50024b2yiw58qecia
TO=cmv7uotll001tb2yi6pwyme5e
sudo -u postgres psql -d alisio_ucetni -v ON_ERROR_STOP=1 -tA <<SQL
begin;
create temp table m as select id from "Transaction" where "bankAccountId"='$ACC';
update "Document" d set "clientId"='$TO' from "TransactionDocument" l
  where l."documentId"=d.id and l."transactionId" in (select id from m)
  and d."clientId"=(select "clientId" from "BankAccount" where id='$ACC');
update "TaxEvent" set "paidTransactionId"=null, status='upcoming', "doneAt"=null
  where "paidTransactionId" in (select id from m) and "clientId"=(select "clientId" from "BankAccount" where id='$ACC');
update "DocumentRequest" set "clientId"='$TO' where "transactionId" in (select id from m);
update "Transaction" set "clientId"='$TO' where id in (select id from m);
update "BankAccount" set "clientId"='$TO' where id='$ACC';
commit;
SQL
sudo -u postgres psql -d alisio_ucetni -tA -F ' | ' -c "select b.name, c.name, (select count(*) from \"Transaction\" t where t.\"bankAccountId\"=b.id and t.\"clientId\"='$TO') from \"BankAccount\" b join \"Client\" c on c.id=b.\"clientId\" where b.id='$ACC'"
