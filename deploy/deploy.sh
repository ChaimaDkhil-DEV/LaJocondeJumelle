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

# Tableau COMPOSE, avec le fichier complémentaire éventuel (serveur d'école : COMPOSE_OVERRIDE_FILE dans deploy/.env).
source deploy/compose-command.sh

# Avant de créer la base : un caractère spécial casserait l'adresse donnée à « migrate », une valeur courte se devine.
# Le mot de passe n'est appliqué qu'à la création de la base ; le changer ensuite : docs/roles-base-de-donnees.md.
OWNER_PASSWORD="${POSTGRES_PASSWORD:-$(env_value POSTGRES_PASSWORD)}"
if ! [[ "${OWNER_PASSWORD}" =~ ^[A-Za-z0-9]{32,128}$ ]]; then
  echo "[deploy] POSTGRES_PASSWORD invalide : 32 à 128 lettres ou chiffres (générer : openssl rand -hex 32). Aucun conteneur modifié." >&2
  echo "[deploy] Serveur déjà installé : changez-le d'abord dans la base, voir docs/roles-base-de-donnees.md." >&2
  exit 1
fi

# Transcription locale demandée sans démarrer Whisper : chaque vocal échouerait (relais de Caddy sans serveur).
if [ "${ASSIST_TRANSCRIPTION_PROVIDER:-$(env_value ASSIST_TRANSCRIPTION_PROVIDER)}" = whisper ] &&
  [ -z "${ASSIST_WHISPER_URL:-$(env_value ASSIST_WHISPER_URL)}" ]; then
  case ",${COMPOSE_PROFILES:-$(env_value COMPOSE_PROFILES)}," in
    *,whisper,*) ;;
    *)
      echo "[deploy] ASSIST_TRANSCRIPTION_PROVIDER=whisper exige COMPOSE_PROFILES=whisper dans deploy/.env (ou ASSIST_WHISPER_URL pour un serveur externe). Aucun conteneur modifié." >&2
      exit 1
      ;;
  esac
fi

echo "[deploy] commit déployé : $(git rev-parse --short HEAD)"

# Image de sauvegarde (postgres:17 et age, audit R03) reconstruite d'abord : une sauvegarde chiffrée
# exige age, absent de l'ancienne image.
echo "[deploy] 1/2 : image de sauvegarde"
"${COMPOSE[@]}" build backup

echo "[deploy] 1/2 : sauvegarde avant mise à jour"
if ! "${COMPOSE[@]}" run --rm --entrypoint /bin/bash backup /scripts/backup.sh; then
  echo "[deploy] ÉCHEC de la sauvegarde : aucun conteneur modifié." >&2
  exit 1
fi

# n8n (profil « n8n », spec 015) : sa base et ses identifiants chiffrés sont sauvegardés aussi
# quand il tourne déjà (premier déploiement de n8n : rien à sauvegarder).
if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx n8n-db; then
  echo "[deploy] 1/2 : sauvegarde de n8n avant mise à jour"
  "${COMPOSE[@]}" build n8n-backup
  if ! "${COMPOSE[@]}" run --rm --entrypoint /bin/bash n8n-backup /scripts/backup.sh; then
    echo "[deploy] ÉCHEC de la sauvegarde de n8n : aucun conteneur modifié." >&2
    exit 1
  fi
fi

echo "[deploy] 2/2 : reconstruction et redémarrage"
"${COMPOSE[@]}" up -d --build

echo "[deploy] terminé. Vérifiez l'état des services : ${COMPOSE[*]} ps"
