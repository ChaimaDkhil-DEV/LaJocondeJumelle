#!/bin/bash
# Mise en production (à lancer sur l'hôte, depuis la racine du dépôt) :
#   deploy/deploy.sh             code à jour (git pull --ff-only), puis déploiement
#   deploy/deploy.sh --no-pull   déploie le code présent (commit précis, retour à une version)
# 0. Mise à jour du code en avance rapide seulement ; arrêt si elle échoue.
# 1. Sauvegarde ponctuelle de la base et des fichiers par le service « backup » ; arrêt si elle échoue.
# 2. Reconstruction et redémarrage des conteneurs. Au démarrage, l'API n'applique une migration en
#    attente que si la sauvegarde a moins de PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES minutes (FR-018).
# Premier déploiement compris : la base est démarrée si besoin avant la sauvegarde.
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
  # Ce script a pu changer et bash le lit au fil de l'exécution : relancer la version à jour.
  exec bash "$0" --no-pull
fi

COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)

echo "[deploy] commit déployé : $(git rev-parse --short HEAD)"

echo "[deploy] 1/2 : sauvegarde avant mise à jour"
if ! "${COMPOSE[@]}" run --rm --entrypoint /bin/bash backup /scripts/backup.sh; then
  echo "[deploy] ÉCHEC de la sauvegarde : aucun conteneur modifié." >&2
  exit 1
fi

echo "[deploy] 2/2 : reconstruction et redémarrage"
"${COMPOSE[@]}" up -d --build

echo "[deploy] terminé. Vérifiez l'état des services : ${COMPOSE[*]} ps"
