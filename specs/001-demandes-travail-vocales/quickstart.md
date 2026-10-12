# Quickstart & validation – Lot 1

Guide pour lancer le projet et prouver, scénario par scénario, que la fonctionnalité répond à
la [spec](./spec.md). Les détails des routes et des données sont dans
[contracts/](./contracts/) et [data-model.md](./data-model.md).

## Prérequis

- Node.js 24 LTS et npm ; Docker et Docker Compose.
- ffmpeg installé localement si l'API est lancée hors Docker.
- Pour tester sur un vrai téléphone : téléphone sur le même réseau et HTTPS (le micro ne
  fonctionne que dans un contexte sécurisé, sauf sur `localhost`).

## Mise en route (développement)

```bash
npm install                                  # installe backend/ et frontend/ (workspaces)
cp backend/.env.example backend/.env         # renseigner DATABASE_URL, SESSION_SECRET, FILES_DIR
docker compose -f deploy/docker-compose.dev.yml up -d db
npm run -w backend prisma:migrate            # applique les migrations (dont les triggers d'ajout seul)
npm run -w backend prisma:seed               # réglages par défaut, catégorie « Photocopies », comptes de démo
npm run -w backend start:dev                 # API sur http://localhost:3000
npm run -w frontend dev                      # SPA sur http://localhost:5173 (proxy /api et /socket.io)
```

Le seed crée des comptes de démonstration (mots de passe dans la sortie du seed, à changer à
la première connexion) : `superadmin`, `responsable`, `enseignante`, `reprographie`.

**Test sur téléphone** : `docker compose -f deploy/docker-compose.dev.yml up caddy` sert
l'application en HTTPS sur `https://<ip-du-poste>:8443` avec un certificat interne Caddy ;
accepter le certificat sur le téléphone.

## Lancer les tests

```bash
npm run -w backend test            # unitaires : machine à états, politique d'accès, délais, fichiers
npm run -w backend test:integration  # API + PostgreSQL de test
npm run -w frontend test           # composants (Vitest)
npx playwright test                # bout en bout + axe, navigateurs Chromium, WebKit, Firefox, profils mobiles
npm audit --audit-level=high       # bloque en cas de vulnérabilité élevée ou critique
```

Résultat attendu : tout au vert, aucune violation axe de niveau A ou AA.

## Scénarios de validation

| # | Scénario (spec) | Étapes | Résultat attendu |
|---|-----------------|--------|------------------|
| V1 | US1 – demande vocale | Sur smartphone (profil Playwright iPhone et Pixel), `enseignante` crée une demande « Photocopies », enregistre 5 s, réécoute, refait, choisit `reprographie`, priorité Urgente, envoie | Statut « Envoyée », horodatée ; `reprographie` lit le vocal (format `audio/mp4`) sur Chromium, WebKit et Firefox |
| V2 | US1 – destinataire hors catégorie | Appel direct `POST /api/requests` avec un `recipientId` non destinataire de la catégorie | `422 RECIPIENT_NOT_ALLOWED`, rien n'est créé |
| V3 | US1 – échec d'envoi | Couper le réseau (Playwright `offline`) au moment de l'envoi, puis le rétablir et cliquer « Réessayer » | Message d'échec ; demande visible dans la boîte d'envoi ; une seule demande créée après relance |
| V4 | US1 – micro refusé | Refuser la permission micro | Explication affichée ; envoi possible avec une description écrite |
| V5 | US2 – circuit direct | `reprographie` : Accepter → En cours → Terminée ; `enseignante` : À corriger sans commentaire, puis avec | Horodatages présents ; correction refusée sans commentaire ; acceptée avec ; affecté notifié |
| V6 | US2 – photo obligatoire | Catégorie avec photo exigée : passer « Terminée » sans photo, puis avec une photo prise | `422 PHOTO_REQUIRED`, puis succès ; photo sans métadonnées EXIF |
| V7 | US2 – refus par l'affecté | `reprographie` refuse une demande « Envoyée » sans motif, puis avec | Refus bloqué, puis statut « Refusée », demandeuse notifiée avec le motif |
| V8 | Annulation | `enseignante` annule une demande « Envoyée », puis tente d'annuler une demande « Acceptée » | « Annulée » ; second cas : action absente de `allowedActions` et `409` si forcée |
| V9 | Transitions concurrentes | Deux sessions acceptent la même demande en même temps | Une réussit, l'autre reçoit `409 STATE_CHANGED` et voit l'état à jour |
| V10 | US3 – fil et confidentialité | Échange texte + vocal + photo ; puis un utilisateur non participant ouvre `/api/requests/:id` et `/api/files/:id` | Messages avec auteur et heure, visibles sans rechargement ; non participant : `404` et entrée `ACCESS_DENIED` dans l'audit |
| V11 | US3 – fichier interdit | Joindre un `.exe` renommé en `.jpg`, puis un PDF de 20 Mo | `415 FILE_TYPE_NOT_ALLOWED` ; `413 FILE_TOO_LARGE` |
| V12 | US4 – notifications | Deux navigateurs ouverts ; envoyer une demande urgente | Notification en < 5 s, sans rechargement, style « Urgente » (icône + texte) ; après reconnexion, les non lues sont présentes |
| V13 | US5 – circuit B | Catégorie en circuit B avec validation finale : soumettre, refuser sans motif, refuser avec motif ; nouvelle demande : approuver + affecter, réaliser, valider | Invisible pour l'agent avant approbation ; motif exigé ; « Refusée » ; puis « En attente de validation finale » → « Clôturée » |
| V14 | US6 – retards | Règle « Urgente » de 1 min de prise en charge ; envoyer sans accepter ; attendre | Compte à rebours affiché ; signalée proche de l'échéance ; « En retard (prise en charge) » en < 30 s après l'échéance ; responsable notifié ; demande toujours visible |
| V15 | US7 – recherche | Jeu de 10 000 demandes (script de seed volumineux) ; filtres combinés statut + priorité + période | Résultats corrects et uniquement autorisés, en < 2 s |
| V16 | US8 – administration | `superadmin` crée un compte, modifie un délai et une catégorie ; un `responsable` tente d'ouvrir `/admin` | Changements appliqués aux nouvelles demandes seulement ; entrées d'audit ; responsable : `403` et audit |
| V17 | Audit non modifiable | En base : `UPDATE "AuditLog" …` et `DELETE FROM "RequestEvent" …` | Erreur levée par le trigger, aucune ligne modifiée |
| V18 | Accessibilité et responsive | Parcours V1, V5, V10 à 320 px, au clavier seul, avec axe | Aucun défilement horizontal ; toutes les actions atteignables au clavier ; aucune violation axe |

## Déploiement (VPS)

```bash
cp deploy/.env.example deploy/.env     # domaine, secrets, chemin des sauvegardes
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f api   # migrations appliquées au démarrage
```

Contrôles : certificat HTTPS valide ; `https://<domaine>/api/files/<id>` sans cookie → `401` ;
aucun port PostgreSQL exposé (`docker compose ps`) ; sauvegarde nocturne présente dans le
dossier de sauvegarde ; **restauration testée** sur une machine de test
(`deploy/backup/restore.sh <archive>`) avant la mise en production.
