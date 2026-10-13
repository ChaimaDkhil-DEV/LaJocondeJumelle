#!/bin/bash
# Boucle du service « backup » : une sauvegarde par jour à BACKUP_TIME (HH:MM, fuseau TZ).
# Un échec est journalisé et la boucle continue (nouvel essai le lendemain).
set -uo pipefail

BACKUP_TIME="${BACKUP_TIME:-02:30}"

while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_TIME}" +%s)
  if [ "${next}" -le "${now}" ]; then
    next=$(date -d "tomorrow ${BACKUP_TIME}" +%s)
  fi
  echo "[backup] prochaine sauvegarde : $(date -d "@${next}" '+%Y-%m-%d %H:%M %Z')"
  sleep $((next - now))
  if ! /bin/bash /scripts/backup.sh; then
    echo "[backup] ÉCHEC de la sauvegarde du $(date '+%Y-%m-%d %H:%M')" >&2
  fi
done
