#!/bin/bash
# Contrôle des sauvegardes (à lancer sur l'hôte par cron, depuis la racine du dépôt) :
#   0 8 * * * cd /chemin/du/depot && deploy/backup/check-backup.sh
# Échoue et alerte BACKUP_ALERT_URL (POST texte) si la dernière sauvegarde de la base ou des
# fichiers, locale ou hors du serveur, est absente ou plus ancienne que BACKUP_MAX_AGE_HOURS.
# Seules les archives chiffrées comptent (audit R03) : une archive en clair ne prouve rien.
# Tourne hors des conteneurs : il signale aussi un service « backup » arrêté.
set -uo pipefail

ENV_FILE="${ENV_FILE:-deploy/.env}"
[ -f "${ENV_FILE}" ] || { echo "Fichier ${ENV_FILE} introuvable : lancez ce script depuis la racine du dépôt." >&2; exit 2; }

source "$(dirname "${BASH_SOURCE[0]}")/../env-file.sh"
setting() { env_value "$1" "${ENV_FILE}"; }
# Dossier de l'hôte : relatif à celui du fichier .env (deploy/), comme pour Docker Compose.
host_dir() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s' "$(dirname "${ENV_FILE}")/$1" ;; esac; }

MAX_AGE_HOURS="$(setting BACKUP_MAX_AGE_HOURS)"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
case "${MAX_AGE_HOURS}" in '' | *[!0-9]*) echo "BACKUP_MAX_AGE_HOURS invalide : ${MAX_AGE_HOURS}" >&2; exit 2 ;; esac
LOCAL_DIR="$(setting BACKUP_DIR)"
LOCAL_DIR="$(host_dir "${LOCAL_DIR:-./backups}")"
OFFSITE_DIR="$(setting BACKUP_OFFSITE_DIR)"
[ -z "${OFFSITE_DIR}" ] || OFFSITE_DIR="$(host_dir "${OFFSITE_DIR}")"
ALERT_URL="$(setting BACKUP_ALERT_URL)"

problems=()
check_dir() {
  local label="$1" dir="$2" pattern
  for pattern in 'db-*.dump.age' 'files-*.tar.gz.age'; do
    if [ -z "$(find "${dir}" -maxdepth 1 -type f -name "${pattern}" -mmin -"$((MAX_AGE_HOURS * 60))" -print -quit 2>/dev/null)" ]; then
      problems+=("${label} : aucune sauvegarde ${pattern} de moins de ${MAX_AGE_HOURS} h dans ${dir}")
    fi
  done
}

check_dir "local" "${LOCAL_DIR}"
if [ -n "${OFFSITE_DIR}" ]; then
  check_dir "hors du serveur" "${OFFSITE_DIR}"
  # Support non monté : la copie resterait sur le disque du serveur.
  local_disk="$(stat -c %d "${LOCAL_DIR}" 2> /dev/null)"
  if [ -n "${local_disk}" ] && [ "${local_disk}" = "$(stat -c %d "${OFFSITE_DIR}" 2> /dev/null)" ]; then
    problems+=("hors du serveur : ${OFFSITE_DIR} est sur le même disque que ${LOCAL_DIR} (support non monté ?)")
  fi
fi

if [ "${#problems[@]}" -eq 0 ]; then
  echo "[check-backup] sauvegardes à jour"
  exit 0
fi

message="Sauvegardes La Joconde Jumelle ($(hostname)) : $(printf '%s ; ' "${problems[@]}")"
echo "[check-backup] ALERTE ${message}" >&2
if [ -n "${ALERT_URL}" ]; then
  if ! curl --fail --silent --show-error --max-time 20 --data-raw "${message}" -H 'Content-Type: text/plain' "${ALERT_URL}" > /dev/null; then
    echo "[check-backup] ÉCHEC de l'envoi de l'alerte" >&2
  fi
fi
exit 1
