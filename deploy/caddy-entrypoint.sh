#!/bin/sh
# Démarrage de Caddy (image web). Publie le certificat racine de son autorité interne, et lui seul,
# dans un volume dédié que l'API monte en lecture seule pour joindre le relais Whisper (port 8444).
# Audit de sécurité R01 : l'API ne monte plus le volume de données de Caddy, qui contient les clés
# privées des certificats HTTPS et de l'autorité.
#
# Caddy crée son autorité au premier démarrage (après l'API) et peut la recréer : le certificat est
# recopié dès qu'il apparaît ou change, de façon atomique. La boucle s'arrête avec Caddy.
set -eu

CA_SOURCE="${CADDY_CA_SOURCE:-/data/caddy/pki/authorities/local/root.crt}"
CA_DIR="${CADDY_CA_DIR:-/ca}"
INTERVAL="${CADDY_CA_INTERVAL:-30}"
# Après exec, Caddy garde ce numéro de processus.
caddy_pid=$$

publish() {
  [ -f "$CA_SOURCE" ] || return 0
  cmp -s "$CA_SOURCE" "$CA_DIR/root.crt" && return 0
  cp "$CA_SOURCE" "$CA_DIR/.root.crt.tmp"
  chmod 0644 "$CA_DIR/.root.crt.tmp"
  mv -f "$CA_DIR/.root.crt.tmp" "$CA_DIR/root.crt"
}

(
  while kill -0 "$caddy_pid" 2>/dev/null; do
    publish || echo "[caddy-ca] publication du certificat racine impossible" >&2
    sleep "$INTERVAL"
  done
) &

exec "$@"
