# Demandes de travail et messagerie vocale — Lot 1

Application web pour une école privée : les employés adressent des demandes de travail à leurs
collègues ou à leurs responsables en **parlant plutôt qu'en écrivant**, depuis un smartphone, une
tablette ou un ordinateur. Chaque demande a son fil de discussion (texte, vocaux, photos, PDF),
un statut suivi, des délais et un historique complet. Les notifications arrivent en temps réel,
dans l'application uniquement.

- **Rôles** : employé, responsable, super administrateur.
- **Circuits** : A (direct) et B (validation administrative préalable), au choix de chaque catégorie.
- **Confidentialité** : fichiers privés servis uniquement par l'API, droits vérifiés côté serveur,
  journal d'audit non modifiable.

## Documentation

| Document | Contenu |
|----------|---------|
| [Spécification](specs/001-demandes-travail-vocales/spec.md) | Besoins, scénarios, critères de réussite, données personnelles, points ouverts |
| [Plan technique](specs/001-demandes-travail-vocales/plan.md) | Pile, architecture, écarts justifiés |
| [Quickstart et validation](specs/001-demandes-travail-vocales/quickstart.md) | Mise en route, tests, scénarios V1–V18, déploiement |
| [Contrats](specs/001-demandes-travail-vocales/contracts/) | API REST, événements temps réel |
| [Modèle de données](specs/001-demandes-travail-vocales/data-model.md) | Entités, statuts, valeurs par défaut |
| [Constitution](.specify/memory/constitution.md) | Principes du projet (TDD, simplicité, accessibilité, sécurité, intégrité) |

## Pile

React, TypeScript, Vite, React Router, TanStack Query et MUI pour l'interface ; NestJS, Prisma
et PostgreSQL 17 pour l'API ; Socket.IO pour le temps réel ; Docker et Caddy pour le déploiement.

## Commandes principales

Prérequis : Node.js 24 et ffmpeg (conversion des vocaux). En développement, PostgreSQL est
fourni par embedded-postgres : Docker n'est nécessaire que pour le déploiement.

Si votre `backend/.env` date d'avant le passage au port 3002, remplacez `PORT=3000` par
`PORT=3002`.

```bash
npm install
cp backend/.env.example backend/.env       # puis renseigner SESSION_SECRET
npm run -w backend db:dev                  # PostgreSQL embarqué (terminal dédié)
npm run -w backend prisma:migrate
npm run -w backend prisma:seed             # réglages, catégories et comptes de démonstration
npm run -w backend start:dev               # API : http://localhost:3002
npm run -w frontend dev                    # interface : http://localhost:5173

npm run verify                             # lint + tests unitaires et d'intégration + audit npm
npm run test:e2e                           # bout en bout : 6 profils navigateur, contrôles axe
```

Avant toute fusion vers `master` : [vérification avant fusion](docs/procedure-fusion.md). Elle est
manuelle : la CI GitHub signale les échecs mais n'empêche pas la fusion.

## Déploiement

Sur un VPS avec Docker (détails et contrôles dans le
[quickstart](specs/001-demandes-travail-vocales/quickstart.md#déploiement-vps)) :

```bash
cp deploy/.env.example deploy/.env         # domaine, secrets, sauvegardes
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api node dist/cli/bootstrap.js admin "Direction"
```

La dernière commande crée le premier super administrateur et affiche une seule fois son mot de
passe provisoire.

Mot de passe du super administrateur perdu : la réinitialisation est tracée dans le journal
d'audit, ferme toutes ses sessions et impose un nouveau mot de passe à la connexion suivante.

```bash
# Développement
npm run -w backend build && node backend/dist/cli/bootstrap.js --reset-password superadmin
# Production (sans identifiant : le plus ancien super administrateur actif)
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api \
  node dist/cli/bootstrap.js --reset-password
```

Les sauvegardes sont quotidiennes (base et fichiers, 14 jours) ; la
restauration (`deploy/backup/restore.sh`) doit être testée avant la mise en production.

## À trancher avant la mise en production

Les valeurs suivantes sont **provisoires** et modifiables dans l'administration ; elles doivent
être validées avec l'établissement (voir la section « Points ouverts » de la spécification) :

- **Durées de conservation des données personnelles** : vocaux, photos et pièces jointes
  12 mois après la clôture ; historique des demandes et journal d'audit 5 ans. La suppression
  automatique à l'échéance n'est pas réalisée dans ce lot.
- Permissions détaillées par rôle, et catégories en circuit B ou avec validation finale.
- Délais par catégorie et priorité, seuil « proche de l'échéance », règles d'escalade.
- Destinataires de chaque catégorie (dont « Photocopies »), photo de preuve obligatoire, mode de clôture.
- Durée maximale et taille des vocaux, formats et taille des pièces jointes.
- Accusé de lecture ou d'écoute.

Restent aussi à réaliser : la vérification manuelle sur un vrai iPhone
([docs/validation/iphone-manuel.md](docs/validation/iphone-manuel.md)) et le test
d'utilisabilité avec cinq employés
([docs/validation/test-utilisabilite-lot1.md](docs/validation/test-utilisabilite-lot1.md)).
