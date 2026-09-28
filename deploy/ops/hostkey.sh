#!/bin/bash
# Публічні ключі SSH-сервера (не секрет) — для закріплення known_hosts у ops/deploy.
for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
  [ -f "$f" ] && ssh-keygen -lf "$f"
done
echo "== ed25519"; cat /etc/ssh/ssh_host_ed25519_key.pub
