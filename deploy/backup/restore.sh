#!/bin/bash
# Restauration d'une sauvegarde (à lancer sur l'hôte, depuis la racine du dépôt) :
#   deploy/backup/restore.sh 20261013T003000Z
# Arrête l'application, restaure la base puis les fichiers, et redémarre.
# ATTENTION : remplace les données actuelles. À tester d'abord sur une machine de test.
set -euo pipefail

STAMP="${1:?Usage : deploy/backup/restore.sh <horodatage, ex. 20261013T003000Z>}"
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)
# Dossier des sauvegardes sur l'hôte (BACKUP_DIR est relatif à deploy/).
# Lecture de la seule variable BACKUP_DIR (le fichier .env n'est pas exécuté).
BACKUP_DIR_VALUE="$(sed -n 's/^BACKUP_DIR=//p' deploy/.env | tail -n 1)"
BACKUP_DIR_HOST="$(cd deploy && cd "${BACKUP_DIR_VALUE:-./backups}" && pwd)"
DB_ARCHIVE="db-${STAMP}.dump"
FILES_ARCHIVE="files-${STAMP}.tar.gz"

for f in "${DB_ARCHIVE}" "${FILES_ARCHIVE}"; do
  [ -f "${BACKUP_DIR_HOST}/${f}" ] || { echo "Archive introuvable : ${BACKUP_DIR_HOST}/${f}" >&2; exit 1; }
done

read -r -p "Remplacer les données actuelles par la sauvegarde ${STAMP} ? Tapez RESTAURER : " answer
[ "${answer}" = "RESTAURER" ] || { echo "Annulé."; exit 1; }

echo "Arrêt de l'application"
"${COMPOSE[@]}" stop caddy api backup

echo "Restauration de la base"
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint pg_restore backup \
  --clean --if-exists --no-owner --exit-on-error --dbname="postgres://" "/backups/${DB_ARCHIVE}"

echo "Restauration des fichiers"
"${COMPOSE[@]}" run --rm --no-deps -T -u root --entrypoint sh \
  -v "${BACKUP_DIR_HOST}:/backups:ro" api \
  -c "find /data/files -mindepth 1 -delete && tar -C /data -xzf /backups/${FILES_ARCHIVE} && chown -R node:node /data/files"

echo "Redémarrage"
"${COMPOSE[@]}" up -d
echo "Restauration terminée. Vérifiez : connexion, une demande avec vocal, une photo, le journal d'audit."
