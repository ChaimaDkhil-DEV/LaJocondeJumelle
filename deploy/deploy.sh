#!/bin/bash
# Mise en production (à lancer sur l'hôte, depuis la racine du dépôt) :
#   deploy/deploy.sh
# 1. Sauvegarde ponctuelle de la base et des fichiers par le service « backup » ; arrêt si elle échoue.
# 2. Reconstruction et redémarrage des conteneurs. Au démarrage, l'API n'applique une migration en
#    attente que si la sauvegarde a moins de PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES minutes (FR-018).
# Premier déploiement compris : la base est démarrée si besoin avant la sauvegarde.
set -euo pipefail

[ -f deploy/docker-compose.yml ] || { echo "Lancez ce script depuis la racine du dépôt : deploy/deploy.sh" >&2; exit 1; }
[ -f deploy/.env ] || { echo "Fichier deploy/.env introuvable : copiez deploy/.env.example puis adaptez-le." >&2; exit 1; }

COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)

echo "[deploy] 1/2 : sauvegarde avant mise à jour"
if ! "${COMPOSE[@]}" run --rm --entrypoint /bin/bash backup /scripts/backup.sh; then
  echo "[deploy] ÉCHEC de la sauvegarde : aucune mise à jour effectuée." >&2
  exit 1
fi

echo "[deploy] 2/2 : reconstruction et redémarrage"
"${COMPOSE[@]}" up -d --build

echo "[deploy] terminé. Vérifiez l'état des services : ${COMPOSE[*]} ps"
