# Mise en production — checklist

À suivre par la personne qui installe l'application sur le serveur de l'établissement, **avant d'ouvrir
l'accès aux utilisateurs**. Elle reprend la checklist de l'audit de sécurité du 2026-11-18 (section I),
après la correction des points P1 (R01 à R04, R09, R10, R12 à R14) et l'ajout des tests manquants G.1 à G.3.

- Une case non cochée bloque l'ouverture.
- Une fois la liste terminée, en garder une copie remplie (date, nom, résultats) dans
  `docs/validation/mise-en-production-AAAA-MM-JJ.md`.
- **Aucun secret dans cette copie** : ni mot de passe, ni clé, ni contenu de `deploy/.env`.

Profil « école » (serveur local et tunnel Cloudflare) : suivre en plus `docs/deploiement-ecole-local.md`.

## 1. Code

- [ ] Le dernier commit de `master` a une CI « Contrôles qualité » verte, et toutes les PR de l'audit sont
      fusionnées (#134 à #146).
- [ ] Tests de bout en bout lancés à la main sur ce commit (`npm run test:e2e`), résultat consigné dans
      `docs/validation/`.
- [ ] Vérification manuelle sur un vrai iPhone (`docs/validation/iphone-manuel.md`) et test d'utilisabilité
      (`docs/validation/test-utilisabilite-lot1.md`) faits, ou leur report décidé par écrit.
- [ ] Le serveur déploie exactement ce commit (`git log -1` sur le serveur).

## 2. Serveur

- [ ] Pare-feu : seuls les ports 22 (restreint aux adresses de l'administration), 80 et 443 (TCP, et UDP pour
      HTTP/3) sont ouverts.
- [ ] SSH par clés seulement : `PasswordAuthentication no` et `PermitRootLogin no`.
- [ ] Mises à jour de sécurité automatiques activées (par exemple `unattended-upgrades`).
- [ ] Rotation des journaux Docker : `log-opts` `max-size` et `max-file` dans `/etc/docker/daemon.json`.
- [ ] Accès au dépôt GitHub par une clé de déploiement **en lecture seule**.
- [ ] Heure du serveur synchronisée (NTP).

## 3. `deploy/.env`

Copier `deploy/.env.example` en `deploy/.env`. Ce fichier ne doit jamais être commité.

- [ ] Droits : `chmod 600 deploy/.env`, propriétaire le compte qui lance `deploy/deploy.sh`.
- [ ] `DOMAIN` et `ACME_EMAIL` réels ; l'enregistrement DNS pointe vers le serveur.
- [ ] `POSTGRES_PASSWORD` : `openssl rand -hex 32`.
- [ ] `SESSION_SECRET` : `openssl rand -base64 48`.
  - Il ne doit **jamais** être perdu ni changé : les QR codes imprimés des classes en dépendent.
- [ ] `APP_DB_PASSWORD` : `openssl rand -hex 32`. C'est le rôle restreint de l'API
      (`docs/roles-base-de-donnees.md`).
- [ ] `BACKUP_AGE_RECIPIENT` : clé publique age (`docs/sauvegardes-chiffrees.md`).
  - La clé privée est générée **hors du serveur**.
  - Elle est conservée en deux copies, à deux endroits différents.
  - Elle n'est jamais sur le serveur.
- [ ] `BACKUP_OFFSITE_DIR` : un autre support que le disque du serveur.
- [ ] `BACKUP_ALERT_URL` : une adresse qui prévient réellement quelqu'un.
- [ ] `SCHOOL_TIMEZONE=Africa/Tunis`.
- [ ] Assistance IA (`ASSIST_*`) : `disabled` ou `rules`, sauf décision écrite (section 8).
- [ ] Notifications push (`PUSH_VAPID_*`) vides et profil `n8n` non lancé, sauf décision écrite (section 8).
- [ ] Une copie de `deploy/.env` est gardée dans un gestionnaire de secrets, hors du serveur. Aucune
      sauvegarde ne le contient.

## 4. Premier démarrage

- [ ] `deploy/deploy.sh` se termine sans erreur.
- [ ] `docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps` :
  - `migrate` est en `exited (0)`, ce qui est normal ;
  - les autres services sont `healthy` ou `running`.
- [ ] Le journal de `migrate` contient `[db-roles] rôle d'exécution « app_runtime »`.
- [ ] L'API utilise bien le rôle restreint. Les deux contrôles se font avec `psql` dans le conteneur `db`,
      mot de passe saisi au clavier (`-W`), jamais sur la ligne de commande :
  - le rôle `app_runtime` n'est pas superutilisateur (`rolsuper` à `f` dans `pg_roles`) ;
  - connecté en `app_runtime`, `ALTER TABLE "AuditLog" DISABLE TRIGGER ALL` répond `permission denied`
    (ou `must be owner`).
- [ ] Ports : `ss -tlnp` sur l'hôte ne montre que 22, 80 et 443. Aucun port 5432, 3000, 8000 ou 5678 n'est
      publié.
- [ ] Premier super administrateur créé par
      `docker compose … exec api node dist/cli/bootstrap.js <identifiant> "<Nom>"`.
  - Le mot de passe temporaire est changé à la première connexion.
- [ ] Un **second super administrateur** de secours existe, avec un autre titulaire.

## 5. Vérifications depuis l'extérieur

- [ ] `https://<domaine>/api/health` répond 200, et `http://<domaine>` redirige vers HTTPS.
- [ ] `https://<domaine>/api/docs` répond 404 : la documentation de l'API est fermée en production.
- [ ] Test TLS externe (par exemple SSL Labs) : note A attendue.
- [ ] En-têtes : `curl -sI https://<domaine>/` montre `Strict-Transport-Security` et
      `Content-Security-Policy`.
- [ ] Scan non intrusif (OWASP ZAP en mode « baseline ») sur un environnement **de recette**, jamais sur la
      production.

## 6. Sauvegardes et restauration

- [ ] Une sauvegarde manuelle produit `db-*.dump.age` et `files-*.tar.gz.age`, sans aucun fichier en clair, dans
      `BACKUP_DIR` et dans `BACKUP_OFFSITE_DIR`.
- [ ] **Restauration testée** sur une machine vierge avec la clé privée (`deploy/backup/restore.sh`) :
  - les données et les fichiers sont revenus ;
  - la durée est mesurée et notée.
- [ ] `deploy/backup/check-backup.sh` est planifié dans la crontab de l'hôte, par exemple
      `0 8 * * * cd /chemin/du/dépôt && deploy/backup/check-backup.sh`.
  - Une alerte de test a bien été reçue.
- [ ] Test de restauration replanifié chaque trimestre (`docs/sauvegardes-chiffrees.md`).

## 7. Comptes et données

- [ ] Aucune donnée de démonstration en production : les données réelles sont chargées par l'import CSV
      (README, « Loading real data »).
- [ ] Comptes réels créés : rôles, groupes Enseignants et Surveillants, classes des enseignants.
- [ ] Permissions par rôle relues dans « Administration > Réglages ».

## 8. Décisions écrites de l'établissement

Chaque décision est datée, signée et conservée par l'établissement.

- [ ] **R13**, séparation des tâches : personne ne traite sa propre demande. Corrigé, la règle est à valider.
- [ ] **R16** : tout admin lit toutes les demandes directes et entre employés, et toutes les conversations avec
      les parents. Accepté « pour le moment » : décision à confirmer ou à revoir.
- [ ] Durées de conservation des données personnelles (README, « To decide before going live »).
- [ ] Assistance IA, notifications push et notifications externes (n8n : e-mail, WhatsApp) : activées seulement
      après décision, accord de traitement et mise à jour du registre RGPD.
- [ ] Qui reçoit la permission de valider les communications aux parents.

## 9. Dans le premier mois (P2 de l'audit)

Ces points ne bloquent pas l'ouverture, mais doivent être planifiés :

- séparation des réseaux Docker et images épinglées (R05, R06) ;
- protection contre la réutilisation d'un QR code déjà scanné (R11) ;
- double authentification pour les super administrateurs (R28) ;
- limiteurs de connexion sans éviction exploitable, déblocage par l'administrateur (R17, R18) ;
- analyse de sécurité automatique dans la CI (SAST, gitleaks, Trivy, E2E) (R30).
