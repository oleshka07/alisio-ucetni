#!/bin/bash
# ID фірм і рахунків (не секрет) — для посилань на сторінки.
sudo -u postgres psql -d alisio_ucetni -tA -F ' | ' -c 'select '"'"'client'"'"', id, name from "Client" union all select '"'"'bank'"'"', id, name from "BankAccount"'
