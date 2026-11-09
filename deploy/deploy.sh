#!/bin/bash
# Production deployment (run on the host, from the repository root):
#   deploy/deploy.sh             update the code (git pull --ff-only), then deploy
#   deploy/deploy.sh --no-pull   deploy the code already present (specific commit, rollback)
# 0. Update the code, fast-forward only; stop if that fails.
# 1. One-off backup of the database and files by the "backup" service; stop if that fails.
# 2. Rebuild and restart the containers. At startup, the API applies a pending migration only if
#    the backup is less than PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES minutes old (FR-018).
# This also covers the first deployment: the database is started if needed before the backup.
set -euo pipefail

PULL=1
case "${1:-}" in
  '') ;;
  --no-pull) PULL=0 ;;
  *) echo "Usage : deploy/deploy.sh [--no-pull]" >&2; exit 1 ;;
esac

[ -f deploy/docker-compose.yml ] || { echo "Lancez ce script depuis la racine du dépôt : deploy/deploy.sh" >&2; exit 1; }
[ -f deploy/.env ] || { echo "Fichier deploy/.env introuvable : copiez deploy/.env.example puis adaptez-le." >&2; exit 1; }

if [ "$PULL" = 1 ]; then
  echo "[deploy] mise à jour du code"
  if ! git pull --ff-only; then
    echo "[deploy] ÉCHEC de git pull : aucun conteneur modifié. Corrigez le dépôt, ou déployez le code présent avec --no-pull." >&2
    exit 1
  fi
  # This script may have changed and bash reads it as it runs: run the updated version.
  exec bash "$0" --no-pull
fi

COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)

echo "[deploy] commit déployé : $(git rev-parse --short HEAD)"

echo "[deploy] 1/2 : sauvegarde avant mise à jour"
if ! "${COMPOSE[@]}" run --rm --entrypoint /bin/bash backup /scripts/backup.sh; then
  echo "[deploy] ÉCHEC de la sauvegarde : aucun conteneur modifié." >&2
  exit 1
fi

# n8n (profil « n8n », spec 015) : sa base et ses identifiants chiffrés sont sauvegardés aussi
# quand il tourne déjà (premier déploiement de n8n : rien à sauvegarder).
if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx n8n-db; then
  echo "[deploy] 1/2 : sauvegarde de n8n avant mise à jour"
  if ! "${COMPOSE[@]}" run --rm --entrypoint /bin/bash n8n-backup /scripts/backup.sh; then
    echo "[deploy] ÉCHEC de la sauvegarde de n8n : aucun conteneur modifié." >&2
    exit 1
  fi
fi

echo "[deploy] 2/2 : reconstruction et redémarrage"
"${COMPOSE[@]}" up -d --build

echo "[deploy] terminé. Vérifiez l'état des services : ${COMPOSE[*]} ps"
