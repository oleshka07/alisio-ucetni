#!/bin/bash
# Účty se zdrojem „IMAP“, ale bez nastaveného IMAP → ruční nahrávání (jinak každá synchronizace hlásí chybu a chodí upozornění).
set -u
q() { sudo -u postgres psql -d alisio_ucetni -tA -F ' | ' -c "$1"; }
q "update \"BankAccount\" set source='manual', \"lastError\"=null, \"failCount\"=0 where source='imap_camt' and (\"imapHost\" is null or \"imapHost\"='') returning name, source"
