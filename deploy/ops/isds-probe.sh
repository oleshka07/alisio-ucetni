#!/bin/bash
# Dosažitelnost webových služeb ISDS ze serveru (bez přihlášení: očekávané 401 = služba odpovídá).
set -u
for h in ws1.mojedatovaschranka.cz ws1.czebox.cz; do
  printf '%s: ' "$h"; curl -s -m 20 -o /dev/null -w '%{http_code}\n' "https://$h/DS/dz" || echo "nedostupné"
done
