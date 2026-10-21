# Préproduction — liste de contrôle (fonctionnalité 003, T055 à T058 et T061)

> Préparée le 2026-10-21 sur `master` (`72c7d81`). Tâches : `specs/003-corrections-audit-technique/tasks.md`
> (T055 à T058, T061) ; scénario 6 de `specs/003-corrections-audit-technique/quickstart.md`.
> Constats fermés une fois la liste déroulée : A22, A23 (T055), A24 (T056), A25 (T057),
> A20 et A26 (T058).

Ordre conseillé : **A** en local (sans serveur), puis **B** et **C** sur la préproduction, puis **D**
sur un serveur vierge. Chaque section dit où consigner le résultat.

## Prérequis

- [ ] Préproduction : hôte Docker avec le dépôt cloné sur `master` (`72c7d81` ou plus récent),
      `deploy/.env` rempli à partir de `deploy/.env.example` (`DOMAIN` pointant vers l'hôte,
      `ACME_EMAIL`, `POSTGRES_PASSWORD`, `SESSION_SECRET`), ports 80 et 443 ouverts.
- [ ] Préproduction déployée une première fois avec `deploy/deploy.sh` ;
      `docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps` : tous les services
      `running`, `api` en `healthy`.
- [ ] Un compte de test sur la préproduction (identifiant et mot de passe connus).
- [ ] Serveur vierge pour D : Docker et Docker Compose installés, rien d'autre.

Dans la suite, `DC` désigne `docker compose -f deploy/docker-compose.yml --env-file deploy/.env`,
lancé depuis la racine du dépôt.

## A. En local — tests de bout en bout et vérification finale (T058, T061)

- [ ] `npm run test:e2e` (tous les profils, dont `e2e/sc001-create-timing.spec.ts`).
      Attendu : tout vert. Les parcours d'affectations (`coverage-class.spec.ts`) s'ignorent
      d'eux-mêmes après 22 h, heure de l'école : lancer en journée pour qu'ils tournent.
- [ ] `npm run verify`, `npm run -w backend typecheck`, `npm run -w frontend typecheck`.
- [ ] CI verte sur le dernier commit de `master` :
      `gh run list --branch master --limit 1`.

Consigner (compteurs de tests, durée de création mesurée par `sc001-create-timing`) dans
`docs/validation/verification-003.md`, section « Vérification finale », sur le modèle de
`verification-finale.md`.

## B. Préproduction — sauvegarde imposée avant migration (T055)

La migration de test se crée **sur l'hôte de préproduction uniquement**, jamais dans le dépôt
local : en local, le hook du projet appliquerait aussitôt tout nouveau `migration.sql` à la base
de développement (voir `CLAUDE.md`).

1. [ ] Créer une migration vide, rangée après la dernière (`0009_supervision_data`) :

   ```text
   mkdir backend/prisma/migrations/9999_test_sauvegarde_imposee
   echo "-- Migration de test (T055), sans effet." > backend/prisma/migrations/9999_test_sauvegarde_imposee/migration.sql
   ```

2. [ ] S'assurer qu'aucune sauvegarde n'a moins d'une heure (sinon le refus n'aura pas lieu) :
       `find deploy/backups -name 'db-*.dump' -mmin -60` ne doit rien afficher (adapter le chemin
       si `BACKUP_DIR` est modifié). Au besoin, attendre ou déplacer temporairement ces fichiers.
3. [ ] Lancer **sans** le script : `DC up -d --build`, puis `DC logs api --tail 20`.
       Attendu : « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. » ;
       `DC ps` montre `api` arrêté ou en redémarrage.
4. [ ] Lancer `deploy/deploy.sh`.
       Attendu : « [deploy] 1/2 : sauvegarde avant mise à jour », une archive
       `db-<horodatage>.dump` (et `files-<horodatage>.tar.gz`) dans le dossier des sauvegardes,
       puis la migration `9999_test_sauvegarde_imposee` appliquée (`DC logs api`).
5. [ ] `DC ps` : `api` en `healthy` (healthcheck sur `http://127.0.0.1:3000/api/health`).
6. [ ] **Nettoyage, dans cet ordre** :
   - supprimer le dossier `backend/prisma/migrations/9999_test_sauvegarde_imposee` sur l'hôte ;
   - retirer la migration de l'historique de Prisma, sinon `migrate status` la signale comme
     « appliquée mais absente » et l'API risque de refuser de démarrer au prochain déploiement :

     ```text
     DC exec db psql -U app -d app -c "DELETE FROM _prisma_migrations WHERE migration_name = '9999_test_sauvegarde_imposee';"
     ```

     (adapter `-U` et `-d` à `POSTGRES_USER` et `POSTGRES_DB`) ;
   - `DC exec api npx --no-install prisma migrate status` : « Database schema is up to date! » ;
   - `git status` sur l'hôte : propre.

Consigner (sorties des étapes 3 à 6, horodatage de l'archive) dans
`docs/validation/verification-003.md`.

## C. Préproduction — en-têtes de sécurité et taille des envois (T057)

1. [ ] `curl -sI https://<domaine>/` et `curl -sI https://<domaine>/api/health`.
       Attendu sur les deux : `strict-transport-security: max-age=31536000; includeSubDomains`,
       `content-security-policy: default-src 'self'; …`, `x-content-type-options: nosniff`,
       `referrer-policy`, `permissions-policy` ; pas d'en-tête `server`.
2. [ ] Envoi de 27 Mo (au-delà de la limite de Caddy, 26 Mo) :

   ```text
   head -c 28311552 /dev/urandom > /tmp/envoi-27mo.bin
   curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://<domaine>" \
     -F kind=DOCUMENT -F file=@/tmp/envoi-27mo.bin https://<domaine>/api/files
   ```

   Attendu : `413`, avant même l'API (pas besoin d'être connecté).
3. [ ] Facultatif, limite de l'API (25 Mo) : se connecter puis envoyer 25,5 Mo.

   ```text
   curl -s -c /tmp/sid.txt -H "Origin: https://<domaine>" -H "Content-Type: application/json" \
     -d '{"username":"<compte>","password":"<mot de passe>"}' https://<domaine>/api/auth/login
   head -c 26738688 /dev/urandom > /tmp/envoi-25-5mo.bin
   curl -s -w "\n%{http_code}\n" -b /tmp/sid.txt -H "Origin: https://<domaine>" \
     -F kind=DOCUMENT -F file=@/tmp/envoi-25-5mo.bin https://<domaine>/api/files
   ```

   Attendu : refus par l'API (code 4xx et message d'erreur), aucun fichier enregistré.
4. [ ] Supprimer les fichiers de test : `rm /tmp/envoi-*.bin /tmp/sid.txt`.

Consigner les sorties dans un nouveau `docs/validation/en-tetes-securite.md` (date, domaine,
en-têtes relevés, codes de retour).

## D. Serveur vierge — restauration d'une sauvegarde réelle (T056)

Utiliser une sauvegarde **réelle** (production, ou préproduction alimentée), jamais la
préproduction elle-même comme cible : la restauration remplace toutes les données.

1. [ ] Cloner le dépôt sur le serveur vierge, au **même commit** que celui qui tournait lors de la
       sauvegarde (sinon l'API trouvera une migration en attente et exigera une sauvegarde
       récente au démarrage).
2. [ ] Créer `deploy/.env` (mêmes `POSTGRES_USER`, `POSTGRES_DB` ; `DOMAIN` du serveur de test).
3. [ ] Copier `db-<horodatage>.dump` et `files-<horodatage>.tar.gz` dans le dossier des
       sauvegardes (`deploy/backups` par défaut).
4. [ ] **Démarrer la base avant la restauration** : `DC up -d db`, puis attendre `healthy`
       (`DC ps`). `restore.sh` lance `pg_restore` avec `--no-deps` : sur un serveur vierge, la base
       ne serait pas démarrée sans cette étape.
5. [ ] Noter l'heure de début, puis `deploy/backup/restore.sh <horodatage>` et taper `RESTAURER`.
       Noter l'heure de fin (le premier `up -d` construit les images : le compter à part).
6. [ ] `DC ps` : tous les services `running`, `api` en `healthy`.
7. [ ] Contrôles dans l'application :
   - [ ] connexion avec un compte existant ;
   - [ ] une demande avec message vocal : lecture du vocal ;
   - [ ] une photo (pièce jointe ou preuve de présence) : affichage ;
   - [ ] journal d'audit (super administrateur) : événements antérieurs à la sauvegarde présents.

Consigner dans un nouveau `docs/validation/restauration.md` : date, serveur, horodatage et
origine de la sauvegarde, durée (restauration seule, et construction des images), résultat de
chaque contrôle, écarts.

## Clôture

- [ ] Cocher T055 à T058 et T061 dans `specs/003-corrections-audit-technique/tasks.md`.
- [ ] Mettre à jour le tableau du §12 de `docs/ARCHITECTURE.md` : A20, A22, A23, A24, A25, A26
      (statut et preuve).
- [ ] Cocher les critères SC atteints dans `specs/003-corrections-audit-technique/spec.md`.
