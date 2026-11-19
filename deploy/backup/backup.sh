#!/bin/bash
# Sauvegarde (research R12) : base PostgreSQL (pg_dump format personnalisé, compressé) et archive
# des fichiers privés (vocaux, photos, documents). Rotation : BACKUP_RETENTION_DAYS (14 par défaut).
# Exécuté dans le service « backup » (image deploy/backup.Dockerfile : postgres:17 et age) ; variables
# PG* fournies par docker compose.
#
# Chiffrement (audit de sécurité R03) : chaque archive est chiffrée avec age pour la ou les clés
# publiques de BACKUP_AGE_RECIPIENT (séparées par des virgules). La clé privée reste hors du serveur :
# celui qui obtient les sauvegardes ne peut pas les lire. Sans clé publique valide, aucune sauvegarde
# n'est faite (jamais en clair). Procédure : docs/sauvegardes-chiffrees.md
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR_IN_CONTAINER:-/backups}"
OFFSITE_DIR="${OFFSITE_DIR_IN_CONTAINER:-/offsite}"
FILES_ROOT="${FILES_ROOT:-/data}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_ARCHIVE="${BACKUP_DIR}/db-${STAMP}.dump.age"
FILES_ARCHIVE="${BACKUP_DIR}/files-${STAMP}.tar.gz.age"

recipients=()
IFS=',' read -r -a keys <<< "${BACKUP_AGE_RECIPIENT:-}"
for key in "${keys[@]}"; do
  key="${key//[[:space:]]/}"
  [ -z "${key}" ] && continue
  if ! [[ "${key}" =~ ^age1[0-9a-z]{58}$ ]]; then
    recipients=()
    break
  fi
  recipients+=(-r "${key}")
done
if [ "${#recipients[@]}" -eq 0 ]; then
  echo "[backup] ÉCHEC : BACKUP_AGE_RECIPIENT absent ou invalide (clé publique age1…, voir docs/sauvegardes-chiffrees.md). Aucune sauvegarde en clair." >&2
  exit 1
fi

umask 077
mkdir -p "${BACKUP_DIR}"
# Copie de travail en clair de la base, hors du dossier des sauvegardes, effacée dans tous les cas.
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}" "${DB_ARCHIVE}.tmp" "${FILES_ARCHIVE}.tmp"' EXIT

# Une archive chiffrée commence par l'en-tête d'age (déchiffrable seulement avec la clé privée).
check_encrypted() {
  [ "$(head -n 1 "$1")" = "age-encryption.org/v1" ] || { echo "[backup] ÉCHEC : $1 n'est pas chiffrée" >&2; exit 1; }
}

echo "[backup] ${STAMP} : base de données"
pg_dump --format=custom --compress=9 --no-owner --file="${WORK}/db.dump"
# Contrôle minimal avant chiffrement : l'archive de la base est lisible par pg_restore.
pg_restore --list "${WORK}/db.dump" > /dev/null
age "${recipients[@]}" -o "${DB_ARCHIVE}.tmp" "${WORK}/db.dump"
check_encrypted "${DB_ARCHIVE}.tmp"
mv "${DB_ARCHIVE}.tmp" "${DB_ARCHIVE}"
rm -f "${WORK}/db.dump"

echo "[backup] ${STAMP} : fichiers"
# Archive chiffrée au fil de l'eau : les fichiers ne sont jamais recopiés en clair.
tar -C "${FILES_ROOT}" -czf - files | age "${recipients[@]}" -o "${FILES_ARCHIVE}.tmp"
check_encrypted "${FILES_ARCHIVE}.tmp"
mv "${FILES_ARCHIVE}.tmp" "${FILES_ARCHIVE}"

# Rotation : archives chiffrées et anciennes archives en clair (antérieures au chiffrement).
rotate() {
  find "$1" -maxdepth 1 -type f \( -name 'db-*.dump.age' -o -name 'files-*.tar.gz.age' -o -name 'db-*.dump' -o -name 'files-*.tar.gz' \) \
    -mtime +"$((RETENTION_DAYS - 1))" -print -delete
}

echo "[backup] rotation : suppression des sauvegardes de plus de ${RETENTION_DAYS} jours"
rotate "${BACKUP_DIR}"

# Copie hors du VPS : dossier BACKUP_OFFSITE_DIR de l'hôte (partage réseau, disque distant) monté sur /offsite.
if [ -n "${OFFSITE_ENABLED:-}" ]; then
  echo "[backup] copie hors du VPS"
  cp "${DB_ARCHIVE}" "${FILES_ARCHIVE}" "${OFFSITE_DIR}/"
  # Même durée de conservation que le dossier local : les données personnelles n'y restent pas plus longtemps.
  rotate "${OFFSITE_DIR}"
else
  echo "[backup] AVERTISSEMENT : aucune copie hors du VPS configurée (BACKUP_OFFSITE_DIR)"
fi

echo "[backup] terminé : $(basename "${DB_ARCHIVE}") $(basename "${FILES_ARCHIVE}")"
