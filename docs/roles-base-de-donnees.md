# Rôles de la base de données

Audit de sécurité du 2026-11-18, point R02. L'API se connectait à PostgreSQL avec le superutilisateur créé
par l'image `postgres` (`POSTGRES_USER`), propriétaire de toutes les tables. Une injection SQL ou une prise
de contrôle de l'API aurait suffi pour :

- désactiver les triggers d'ajout seul, puis réécrire ou effacer le journal d'audit et l'historique ;
- supprimer des tables ;
- lancer des commandes système sur le serveur de base de données (`COPY … TO PROGRAM`).

## Deux comptes

| Compte | Utilisé par | Droits |
|---|---|---|
| `POSTGRES_USER` (propriétaire, superutilisateur) | service `migrate`, sauvegardes, restauration | tous |
| `APP_DB_USER` (`app_runtime` par défaut) | API | lecture et écriture des lignes seulement |

Le rôle d'exécution :

- n'est ni superutilisateur, ni propriétaire, ni membre d'un autre rôle, et ne peut créer ni rôle ni base ;
- ne peut ni créer, ni modifier, ni supprimer une table, ni vider une table (`TRUNCATE`), ni désactiver un
  trigger, ni lire `_prisma_migrations` ;
- sur les tables en ajout seul, perd en plus les droits que leurs triggers interdisent : `UPDATE` et
  `DELETE` sur le journal d'audit, l'historique des demandes et des attributions, les révisions et
  événements des communications ; `DELETE` sur les présences, les départs, les séances et les séries
  d'emploi du temps. La liste est déduite des triggers (`forbid_modification`, `forbid_deletion`) : une
  future table en ajout seul est couverte sans rien changer.

## Fonctionnement

1. Au démarrage (`docker compose up`, `deploy/deploy.sh`), le service `migrate` s'exécute une fois, avec le
   compte propriétaire (`deploy/migrate-entrypoint.sh`) :
   - une migration en attente n'est appliquée qu'avec une sauvegarde de moins de
     `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes (inchangé) ;
   - le rôle d'exécution est créé s'il manque, et son mot de passe (`APP_DB_PASSWORD`) et ses droits sont
     réappliqués (`node dist/cli/db-roles.js`).
2. L'API ne démarre qu'après la réussite de `migrate` (`service_completed_successfully`). Elle ne reçoit
   que l'URL du rôle d'exécution : le mot de passe propriétaire n'est jamais dans son conteneur.
3. En production, l'API refuse de démarrer si son rôle est superutilisateur, propriétaire des tables (ou
   membre du propriétaire), ou peut créer des rôles ou des bases : une `DATABASE_URL` avec le compte
   propriétaire est une erreur de configuration.

`docker compose ps` affiche `migrate` arrêté (`exited (0)`) : c'est normal.

## Configuration

Dans `deploy/.env`, en plus de `POSTGRES_PASSWORD` :

```text
APP_DB_PASSWORD=          # openssl rand -hex 32 (lettres et chiffres, 32 caractères au moins)
# APP_DB_USER=app_runtime  # facultatif
```

## Serveur déjà en service (mise à jour)

1. Avant la mise à jour, ajouter `APP_DB_PASSWORD` dans `deploy/.env`. Sans lui, `deploy/deploy.sh`
   s'arrête avant de toucher aux conteneurs (« APP_DB_PASSWORD manquant ») ; l'application continue de
   tourner sur l'ancienne version.
2. Lancer `deploy/deploy.sh`. Le journal de `migrate` doit contenir
   `[db-roles] rôle d'exécution « app_runtime » : lecture et écriture sur … tables`.
   Aucune donnée n'est modifiée ; le compte propriétaire reste le même.
3. Vérifier : `docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs migrate api`, puis
   une connexion à l'application.

## Changer le mot de passe du rôle d'exécution

Modifier `APP_DB_PASSWORD` dans `deploy/.env`, puis `deploy/deploy.sh` (ou `docker compose … up -d`) :
`migrate` applique le nouveau mot de passe avant que l'API redémarre avec lui.

## Restauration et changement de serveur

`deploy/backup/restore.sh` ignore les droits contenus dans la sauvegarde (`--no-privileges`) : sur un
nouveau serveur, le rôle d'exécution peut ne pas encore exister. Au redémarrage qui suit, `migrate` le crée
et réapplique ses droits. Après un changement de serveur, `APP_DB_PASSWORD` peut différer de l'ancien.

## Si l'API refuse de démarrer

- « Rôle PostgreSQL trop puissant pour l'API » : `DATABASE_URL` de l'API utilise le compte propriétaire.
  Elle doit être celle de `deploy/docker-compose.yml` (rôle `APP_DB_USER`).
- `migrate` en échec : lire `docker compose … logs migrate`. « Migration en attente sans sauvegarde
  récente » : lancer `deploy/deploy.sh`. « APP_DB_PASSWORD invalide » : 32 à 128 lettres ou chiffres.

## Vérification (2026-11-18)

- Test d'intégration `backend/test/integration/db-runtime-role.spec.ts` : attributs du rôle, lecture,
  écriture et verrous consultatifs permis ; `DROP`, `CREATE TABLE`, `TRUNCATE`, désactivation des
  triggers, `COPY … PROGRAM`, `session_replication_role`, `CREATE ROLE`, lecture de `_prisma_migrations`
  refusés ; droits des tables en ajout seul ; idempotence et changement de mot de passe ; refus des
  valeurs invalides ; parcours complet (connexion, demande, historique, audit).
- Toute la suite d'intégration fait tourner l'application avec le rôle d'exécution (`createTestApp`) :
  un parcours qui aurait besoin de plus de droits échoue en CI.
