#!/bin/bash
# Boucle du service « backup » : une sauvegarde par jour à BACKUP_TIME (HH:MM, fuseau TZ).
# Un échec est journalisé et la boucle continue (nouvel essai le lendemain).
set -uo pipefail

BACKUP_TIME="${BACKUP_TIME:-02:30}"

# Une heure illisible donnait une attente négative, donc des sauvegardes en boucle jusqu'à remplir le disque.
if ! [[ "${BACKUP_TIME}" =~ ^([01]?[0-9]|2[0-3]):[0-5][0-9]$ ]]; then
  echo "[backup] ÉCHEC : BACKUP_TIME invalide (${BACKUP_TIME}) : heure HH:MM attendue, de 00:00 à 23:59" >&2
  exit 1
fi

# Instant de BACKUP_TIME, aujourd'hui ou demain (today, tomorrow). Une heure qui n'existe pas (passage à l'heure
# d'été) est refusée par date : une heure plus tard ce jour-là.
occurrence() {
  date -d "$1 ${BACKUP_TIME}" +%s 2> /dev/null ||
    date -d "$1 $(printf '%02d' "$((10#${BACKUP_TIME%%:*} + 1))"):${BACKUP_TIME##*:}" +%s 2> /dev/null
}

while true; do
  now=$(date +%s)
  next=$(occurrence today)
  if [ -n "${next}" ] && [ "${next}" -le "${now}" ]; then
    next=$(occurrence tomorrow)
  fi
  if [ -z "${next}" ]; then
    echo "[backup] ÉCHEC : heure de la prochaine sauvegarde incalculable, nouvel essai dans une heure" >&2
    sleep 3600
    continue
  fi
  echo "[backup] prochaine sauvegarde : $(date -d "@${next}" '+%Y-%m-%d %H:%M %Z')"
  sleep $((next - now))
  if ! /bin/bash /scripts/backup.sh; then
    echo "[backup] ÉCHEC de la sauvegarde du $(date '+%Y-%m-%d %H:%M')" >&2
  fi
done
