#!/bin/bash
# Restauration d'une sauvegarde (à lancer sur l'hôte, depuis la racine du dépôt) :
#   deploy/backup/restore.sh 20261013T003000Z /chemin/vers/cle-sauvegardes.txt
# Les archives sont chiffrées (audit de sécurité R03) : la clé privée age, gardée hors du serveur, est
# copiée le temps de la restauration puis retirée (docs/sauvegardes-chiffrees.md). Les deux archives
# sont déchiffrées et vérifiées avant toute modification. Ensuite : arrêt de l'application,
# restauration de la base puis des fichiers, redémarrage.
# Une ancienne archive en clair (antérieure au chiffrement) se restaure sans clé.
# ATTENTION : remplace les données actuelles. À tester d'abord sur une machine de test.
set -euo pipefail

USAGE="Usage : deploy/backup/restore.sh <horodatage, ex. 20261013T003000Z> <fichier de clé privée age>"
STAMP="${1:?${USAGE}}"
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)
# Dossier des sauvegardes sur l'hôte (BACKUP_DIR est relatif à deploy/).
# Lecture de la seule variable BACKUP_DIR (le fichier .env n'est pas exécuté).
BACKUP_DIR_VALUE="$(sed -n 's/^BACKUP_DIR=//p' deploy/.env | tail -n 1)"
BACKUP_DIR_HOST="$(cd deploy && cd "${BACKUP_DIR_VALUE:-./backups}" && pwd)"

if [ -f "${BACKUP_DIR_HOST}/db-${STAMP}.dump.age" ]; then
  ENCRYPTED=1
  DB_ARCHIVE="db-${STAMP}.dump.age"
  FILES_ARCHIVE="files-${STAMP}.tar.gz.age"
  KEY_ARG="${2:?${USAGE}}"
  [ -f "${KEY_ARG}" ] || { echo "Clé privée introuvable : ${KEY_ARG}" >&2; exit 1; }
  KEY_FILE="$(cd "$(dirname "${KEY_ARG}")" && pwd)/$(basename "${KEY_ARG}")"
  # Clé montée en lecture seule dans le conteneur de sauvegarde, jamais copiée dans les sauvegardes.
  KEY_MOUNT=(-v "${KEY_FILE}:/run/age-key:ro")
else
  ENCRYPTED=0
  DB_ARCHIVE="db-${STAMP}.dump"
  FILES_ARCHIVE="files-${STAMP}.tar.gz"
  KEY_MOUNT=()
  echo "Archive en clair (antérieure au chiffrement) : aucune clé nécessaire."
fi

for f in "${DB_ARCHIVE}" "${FILES_ARCHIVE}"; do
  [ -f "${BACKUP_DIR_HOST}/${f}" ] || { echo "Archive introuvable : ${BACKUP_DIR_HOST}/${f}" >&2; exit 1; }
done

# Commandes exécutées dans le conteneur de sauvegarde (image avec age) : sortie de l'archive en clair.
if [ "${ENCRYPTED}" = 1 ]; then
  DB_PLAIN='age -d -i /run/age-key -o "$t" "/backups/'"${DB_ARCHIVE}"'"'
  FILES_PLAIN='age -d -i /run/age-key "/backups/'"${FILES_ARCHIVE}"'"'
else
  DB_PLAIN='cp "/backups/'"${DB_ARCHIVE}"'" "$t"'
  FILES_PLAIN='cat "/backups/'"${FILES_ARCHIVE}"'"'
fi
# Entrée standard fermée : ces conteneurs ne lisent rien du terminal (réponse RESTAURER comprise).
in_backup() { "${COMPOSE[@]}" run --rm --no-deps -T "${KEY_MOUNT[@]}" --entrypoint sh backup -c "$1" < /dev/null; }

echo "Vérification des archives (rien n'est encore modifié)"
if [ "${ENCRYPTED}" = 1 ]; then
  in_backup 'age -d -i /run/age-key -o /dev/null "/backups/'"${FILES_ARCHIVE}"'"' \
    || { echo "Archive des fichiers illisible avec cette clé : rien n'a été modifié." >&2; exit 1; }
fi
in_backup 't="$(mktemp)"; trap "rm -f \"$t\"" EXIT; '"${DB_PLAIN}"' && pg_restore --list "$t" > /dev/null' \
  || { echo "Archive de la base illisible (clé ou archive) : rien n'a été modifié." >&2; exit 1; }

read -r -p "Remplacer les données actuelles par la sauvegarde ${STAMP} ? Tapez RESTAURER : " answer
[ "${answer}" = "RESTAURER" ] || { echo "Annulé."; exit 1; }

echo "Arrêt de l'application"
"${COMPOSE[@]}" stop caddy api backup

echo "Restauration de la base"
# Droits de la sauvegarde ignorés (--no-privileges) : le rôle d'exécution peut ne pas exister ici (nouveau
# serveur). Le service migrate le crée et réapplique ses droits au redémarrage (audit de sécurité R02).
# Copie en clair dans le conteneur éphémère seulement, effacée à la sortie.
in_backup 'set -e; t="$(mktemp)"; trap "rm -f \"$t\"" EXIT; '"${DB_PLAIN}"'; pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="postgres://" "$t"'

echo "Restauration des fichiers"
# Déchiffrement au fil de l'eau, du conteneur de sauvegarde vers l'API : aucun fichier en clair sur l'hôte.
in_backup "${FILES_PLAIN}" | "${COMPOSE[@]}" run --rm --no-deps -T -u root --entrypoint sh api \
  -c "find /data/files -mindepth 1 -delete && tar -C /data -xzf - && chown -R node:node /data/files"

echo "Redémarrage"
"${COMPOSE[@]}" up -d
echo "Restauration terminée. Vérifiez : connexion, une demande avec vocal, une photo, le journal d'audit."
if [ "${ENCRYPTED}" = 1 ]; then
  echo "Retirez la clé privée du serveur : ${KEY_FILE}"
fi
