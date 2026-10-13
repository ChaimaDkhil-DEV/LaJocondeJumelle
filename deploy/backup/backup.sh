#!/bin/bash
# Sauvegarde (research R12) : base PostgreSQL (pg_dump format personnalisé, compressé) et archive
# des fichiers privés (vocaux, photos, documents). Rotation : BACKUP_RETENTION_DAYS (14 par défaut).
# Exécuté dans le service « backup » (image postgres:17) ; variables PG* fournies par docker compose.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR_IN_CONTAINER:-/backups}"
FILES_ROOT="${FILES_ROOT:-/data}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_ARCHIVE="${BACKUP_DIR}/db-${STAMP}.dump"
FILES_ARCHIVE="${BACKUP_DIR}/files-${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"
umask 077

echo "[backup] ${STAMP} : base de données"
pg_dump --format=custom --compress=9 --no-owner --file="${DB_ARCHIVE}.tmp"
mv "${DB_ARCHIVE}.tmp" "${DB_ARCHIVE}"

echo "[backup] ${STAMP} : fichiers"
tar -C "${FILES_ROOT}" -czf "${FILES_ARCHIVE}.tmp" files
mv "${FILES_ARCHIVE}.tmp" "${FILES_ARCHIVE}"

# Contrôle minimal : l'archive de la base est lisible par pg_restore.
pg_restore --list "${DB_ARCHIVE}" > /dev/null

echo "[backup] rotation : suppression des sauvegardes de plus de ${RETENTION_DAYS} jours"
find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -mtime +"$((RETENTION_DAYS - 1))" -print -delete

# Copie hors du VPS : dossier BACKUP_OFFSITE_DIR de l'hôte (partage réseau, disque distant) monté sur /offsite.
if [ -n "${OFFSITE_ENABLED:-}" ]; then
  echo "[backup] copie hors du VPS"
  cp "${DB_ARCHIVE}" "${FILES_ARCHIVE}" /offsite/
else
  echo "[backup] AVERTISSEMENT : aucune copie hors du VPS configurée (BACKUP_OFFSITE_DIR)"
fi

echo "[backup] terminé : $(basename "${DB_ARCHIVE}") $(basename "${FILES_ARCHIVE}")"
