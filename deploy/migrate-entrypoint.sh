#!/bin/sh
# Service « migrate » (audit de sécurité R02), exécuté une fois avant chaque démarrage de l'API, seul à
# détenir le compte propriétaire de la base (DATABASE_URL) ; l'API se connecte avec le rôle d'exécution.
# 1. Une migration en attente n'est appliquée que si une sauvegarde chiffrée de la base (db-*.dump.age,
#    audit R03) de moins de PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES minutes existe dans PRE_MIGRATION_BACKUP_DIR
#    (research R12, FR-018) ; sinon le service échoue sans toucher la base, et l'API ne démarre pas.
#    deploy/deploy.sh fait cette sauvegarde avant de reconstruire et redémarrer les conteneurs.
# 2. Le rôle d'exécution (APP_DB_USER, APP_DB_PASSWORD) et ses droits sont créés ou mis à jour, à chaque
#    fois : les tables d'une nouvelle migration sont couvertes.
set -eu

BACKUP_DIR="${PRE_MIGRATION_BACKUP_DIR:-/backups}"
MAX_AGE_MINUTES="${PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES:-60}"

# « migrate status » sort en 1 aussi bien pour une migration en attente que pour une base
# injoignable : seul le texte les distingue (sorties relevées en T049).
if STATUS="$(npx --no-install prisma migrate status 2>&1)"; then
  printf '%s\n' "$STATUS"
else
  case "$STATUS" in
    *"have not yet been applied"*)
      printf '%s\n' "$STATUS"
      RECENT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump.age' -mmin -"$MAX_AGE_MINUTES" 2>/dev/null || true)"
      if [ -z "$RECENT" ]; then
        echo "Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh." >&2
        exit 1
      fi
      npx --no-install prisma migrate deploy
      ;;
    *)
      printf '%s\n' "$STATUS" >&2
      exit 1
      ;;
  esac
fi

node dist/cli/db-roles.js
