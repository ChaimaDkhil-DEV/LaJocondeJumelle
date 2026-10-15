# Contrats des outils d'exploitation, du déploiement et de la CI

## Outil d'initialisation — `backend/src/cli/bootstrap.ts`

Compilé dans `dist/cli/bootstrap.js` (disponible dans l'image de production).

| Appel | Effet | Sortie | Code |
|---|---|---|---|
| `bootstrap.js [identifiant] ["nom affiché"]` | **Inchangé** : réglages, permissions, premier super administrateur s'il n'en existe aucun | mot de passe provisoire affiché une fois, ou « existe déjà » | 0 |
| `bootstrap.js --reset-password` | **Nouveau** : réinitialise le plus ancien super administrateur actif | `Mot de passe provisoire de « <identifiant> » (affiché une seule fois, à changer à la première connexion) : <mot de passe>` | 0 |
| `bootstrap.js --reset-password <identifiant>` | **Nouveau** : réinitialise ce compte s'il est super administrateur | idem | 0 |
| `--reset-password` sur un compte absent ou non super administrateur | aucune écriture | `Compte « <identifiant> » introuvable ou non super administrateur : aucune modification.` (stderr) | 1 |
| base inaccessible | aucune écriture (transaction unique) | message d'erreur (stderr) | 1 |

Effets de `--reset-password` : voir [data-model.md](../data-model.md) §AuditLog.

Exemples :

```bash
# Développement
npm run -w backend build && node backend/dist/cli/bootstrap.js --reset-password superadmin
# Production
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api \
  node dist/cli/bootstrap.js --reset-password
```

`backend/scripts/reset-superadmin-password.ts` est **supprimé**.

## Déploiement — `deploy/deploy.sh` (nouveau, sur l'hôte, depuis la racine du dépôt)

1. `docker compose … run --rm --entrypoint /bin/bash backup /scripts/backup.sh` ; s'arrête
   (code ≠ 0) si la sauvegarde échoue.
2. `docker compose … up -d --build`.

## Démarrage de l'API — `deploy/api-entrypoint.sh` (modifié)

```text
si `prisma migrate status` indique des migrations en attente :
    si aucune archive /backups/db-*.dump de moins de PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES :
        afficher « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. » ; sortir 1
    prisma migrate deploy
exec node dist/main.js
```

`docker-compose.yml` monte `${BACKUP_DIR:-./backups}:/backups:ro` dans le service `api`.

## Intégration continue — `.github/workflows/ci.yml` (nouveau)

| Déclencheur | `push`, `pull_request` |
|---|---|
| Environnement | `ubuntu-latest`, Node 24, `ffmpeg` |
| Étapes (toutes bloquantes) | `npm ci` → `npm run lint` → typecheck backend et frontend → tests unitaires backend (dont `architecture-layers.spec.ts`) → tests d'intégration backend → tests frontend (dont `enums-sync.test.ts`) → `npm audit --audit-level=high` |
| Hors CI (manuel, compte rendu dans `docs/validation/`) | `npm run test:e2e`, dont le chronométrage de création `e2e/sc001-create-timing.spec.ts` |

Le test de performance de recherche (`backend/test/integration/search-performance.spec.ts`) fait partie de la suite d'intégration, donc de la CI. S'il s'avère instable sur les machines GitHub, il sera exclu de la CI et rejoué manuellement (décision à consigner dans le compte rendu).
