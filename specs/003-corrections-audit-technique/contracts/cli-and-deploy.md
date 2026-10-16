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
si `prisma migrate status` échoue pour une autre raison (base injoignable) :
    afficher sa sortie ; sortir 1
si `prisma migrate status` indique des migrations en attente :
    si aucune archive ${PRE_MIGRATION_BACKUP_DIR:-/backups}/db-*.dump de moins de PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES :
        afficher « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. » ; sortir 1
    prisma migrate deploy
exec node dist/main.js
```

`docker-compose.yml` monte `${BACKUP_DIR:-./backups}:/backups:ro` dans le service `api`.

Test automatisé : `backend/test/unit/api-entrypoint.spec.ts` (research R12), cinq cas :
schéma à jour, migration en attente sans archive, avec archive trop ancienne, avec archive
récente, base inaccessible.

## Intégration continue — `.github/workflows/ci.yml` (nouveau)

| Déclencheur | `push`, `pull_request` |
| Job | identifiant `verify`, nom « Contrôles qualité » (nom stable, cité par la vérification avant fusion ; à rendre obligatoire si la protection de branche devient disponible, D10) |
|---|---|
| Environnement | `ubuntu-latest`, Node 24, `ffmpeg` |
| Étapes (toutes bloquantes) | `npm ci` → `npm run lint` → typecheck backend et frontend → tests unitaires backend (dont `architecture-layers.spec.ts`) → tests d'intégration backend → tests frontend (dont `enums-sync.test.ts`) → `npm audit --audit-level=high` |
| Hors CI (manuel, compte rendu dans `docs/validation/`) | `npm run test:e2e`, dont le chronométrage de création `e2e/sc001-create-timing.spec.ts` |

Le test de performance de recherche (`backend/test/integration/search-performance.spec.ts`) fait partie de la suite d'intégration, donc de la CI. S'il s'avère instable sur les machines GitHub, il sera exclu de la CI et rejoué manuellement (décision à consigner dans le compte rendu).

## Vérification avant fusion vers `master` — procédure manuelle (D10, nouveau)

Le dépôt GitHub reste privé, sur l'offre gratuite : les règles de protection de branche n'y
sont pas disponibles ([VÉRIFIÉ] le 2026-10-15, l'API renvoie `403 Upgrade to GitHub Pro or make
this repository public`). **Cette procédure est manuelle et ne constitue pas une protection
technique** : GitHub n'empêche ni la fusion d'une demande dont la CI échoue, ni un envoi direct
sur `master`. La règle de la constitution (« Aucune modification ne peut être fusionnée si la
suite de tests échoue ») repose sur la personne qui fusionne.

Fichiers (créés par T006) : `docs/procedure-fusion.md` (procédure de référence) et
`.github/pull_request_template.md` (les quatre contrôles en cases à cocher, lien vers la
procédure ; GitHub ne l'applique qu'une fois présent sur `master`).

Règles :
- toute modification de `master` passe par une demande de fusion ; pas d'envoi direct ;
- juste avant de fusionner, la personne qui fusionne vérifie les quatre contrôles sur le
  **dernier commit** de la demande et les coche dans sa description ; un contrôle non coché ou
  non satisfait interdit la fusion.

| # | Contrôle | Comment le vérifier | Fusion interdite si |
|---|---|---|---|
| 1 | Résultat de la CI | `gh pr checks <n°>` ou onglet « Checks » : job « Contrôles qualité » exécuté sur le dernier commit | absent, en cours, en échec ou annulé |
| 2 | Tests requis | le job a exécuté toutes ses étapes (lint, typecheck backend et frontend, tests unitaires, d'intégration et frontend, `npm audit --audit-level=high`) ; pour une livraison, en plus, `npm run test:e2e` lancé à la main et consigné dans `docs/validation/` (FR-019) | une étape manque ou a été sautée ; compte rendu de bout en bout absent pour une livraison |
| 3 | Aucun échec non résolu | aucun test désactivé ou ignoré (`.skip`, `.only`, `--testPathIgnorePatterns`) sans raison consignée dans `docs/validation/` ; branche à jour avec `master` (sinon y fusionner `master` et attendre une nouvelle CI verte) ; aucune discussion de revue ouverte | une de ces conditions n'est pas remplie |
| 4 | Examen du diff | relecture complète de `gh pr diff <n°>` (onglet « Files changed ») selon la revue de code de la constitution : tests écrits d'abord et verts, attendus des tests existants inchangés sauf exception documentée (SC-007), aucun secret, aucun fichier inattendu | un point de la revue n'est pas satisfait |

Fusion faite malgré un échec : la corriger aussitôt par une nouvelle demande de fusion (correctif
ou `git revert`) et le consigner dans `docs/validation/`.

Si le dépôt passe à une offre qui permet la protection de branche, créer la règle décrite en
research R11 ; les contrôles 2 à 4 restent à vérifier à la main.
