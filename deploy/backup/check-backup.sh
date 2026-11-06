#!/bin/bash
# Contrôle des sauvegardes (à lancer sur l'hôte par cron, depuis la racine du dépôt) :
#   0 8 * * * cd /chemin/du/depot && deploy/backup/check-backup.sh
# Échoue et alerte BACKUP_ALERT_URL (POST texte) si la dernière sauvegarde de la base ou des
# fichiers, locale ou hors du serveur, est absente ou plus ancienne que BACKUP_MAX_AGE_HOURS.
# Tourne hors des conteneurs : il signale aussi un service « backup » arrêté.
set -uo pipefail

ENV_FILE="${ENV_FILE:-deploy/.env}"
[ -f "${ENV_FILE}" ] || { echo "Fichier ${ENV_FILE} introuvable : lancez ce script depuis la racine du dépôt." >&2; exit 2; }

# Lecture des seules variables utiles (le fichier .env n'est pas exécuté).
env_value() { sed -n "s/^$1=//p" "${ENV_FILE}" | tail -n 1; }

MAX_AGE_HOURS="$(env_value BACKUP_MAX_AGE_HOURS)"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
case "${MAX_AGE_HOURS}" in '' | *[!0-9]*) echo "BACKUP_MAX_AGE_HOURS invalide : ${MAX_AGE_HOURS}" >&2; exit 2 ;; esac
LOCAL_DIR="$(env_value BACKUP_DIR)"
LOCAL_DIR="$(dirname "${ENV_FILE}")/${LOCAL_DIR:-./backups}"
case "$(env_value BACKUP_DIR)" in /*) LOCAL_DIR="$(env_value BACKUP_DIR)" ;; esac
OFFSITE_DIR="$(env_value BACKUP_OFFSITE_DIR)"
ALERT_URL="$(env_value BACKUP_ALERT_URL)"

problems=()
check_dir() {
  local label="$1" dir="$2" pattern
  for pattern in 'db-*.dump' 'files-*.tar.gz'; do
    if [ -z "$(find "${dir}" -maxdepth 1 -type f -name "${pattern}" -mmin -"$((MAX_AGE_HOURS * 60))" -print -quit 2>/dev/null)" ]; then
      problems+=("${label} : aucune sauvegarde ${pattern} de moins de ${MAX_AGE_HOURS} h dans ${dir}")
    fi
  done
}

check_dir "local" "${LOCAL_DIR}"
[ -z "${OFFSITE_DIR}" ] || check_dir "hors du serveur" "${OFFSITE_DIR}"

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
