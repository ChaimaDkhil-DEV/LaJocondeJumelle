# Quickstart : valider les corrections de l'audit technique

Guide de vérification, scénario par scénario. Les détails de conception sont dans
[research.md](./research.md), [data-model.md](./data-model.md) et [contracts/](./contracts/).

## Prérequis

- Windows 11 ou Linux, Node.js 24, ffmpeg dans le `PATH`.
- `npm install` à la racine.
- Pour les scénarios 5 et 6 : un serveur de préproduction avec Docker Compose et un nom de
  domaine en HTTPS.

## Scénario 1 — Démarrage sur le port 3002 (US1, FR-001 à FR-003, SC-001, SC-003)

```bash
cp backend/.env.example backend/.env       # renseigner SESSION_SECRET uniquement
npm run -w backend db:dev                  # terminal dédié
npm run -w backend prisma:migrate && npm run -w backend prisma:seed
npm run dev                                # ou start.bat sous Windows
```

Attendu : l'API répond sur `http://localhost:3002/api/health` ; l'interface sur
`http://localhost:5173` affiche la connexion et la connexion de démonstration réussit ; une
modification d'un fichier de `backend/src` redémarre l'API sans compilation manuelle.
Chronométrer le parcours, de `cp` à la connexion réussie (hors téléchargements) : moins de
10 minutes (SC-001).

API arrêtée, interface lancée : une action affiche « Une erreur inattendue est survenue.
Réessayez plus tard. » (réponse 502 du proxy Vite), sans écran blanc ; vérifié aussi par
`frontend/tests/api/client.test.ts`.

```bash
git grep -n "3000" -- README.md backend/.env.example deploy/Caddyfile.dev backend/test
```

Attendu : aucun résultat.

## Scénario 2 — Configuration refusée au démarrage (US2, FR-004)

```bash
npm run -w backend test -- config.spec
```

Attendu : vert, y compris les cas `TRUST_PROXY` invalide et port invalide. Vérification à la
main : `TRUST_PROXY=nimporte npm run -w backend start:dev` s'arrête avec le message de
[contracts/configuration.md](./contracts/configuration.md).

## Scénario 3 — Réinitialisation tracée du super administrateur (US2, FR-007, FR-010, SC-004)

1. Se connecter en `superadmin` dans deux navigateurs.
2. `npm run -w backend build && node backend/dist/cli/bootstrap.js --reset-password superadmin`
3. Attendu : un mot de passe provisoire s'affiche une fois ; dans les deux navigateurs, la
   session est fermée à la requête suivante (temps réel : au plus 60 s) ; la reconnexion impose
   le changement de mot de passe ; le journal d'audit (écran Administration → Journal) montre
   `PASSWORD_RESET`, cible `superadmin`, motif `CLI`, sans acteur.
4. `node backend/dist/cli/bootstrap.js --reset-password inconnu` → code 1, aucune écriture.
5. `backend/scripts/reset-superadmin-password.ts` n'existe plus.

Tests automatisés : test d'intégration de `resetSuperAdminPassword` (transaction, sessions,
audit).

## Scénario 4 — Affectation figée à la soumission (US3, FR-008 à FR-011, SC-005)

Avec la catégorie de démonstration en circuit B, affectation automatique vers l'employé E1 :

| Étape | Attendu |
|---|---|
| Soumettre une demande D1, puis désigner E2 dans la catégorie, puis approuver D1 | D1 affectée à E1 ; historique : source `SNAPSHOT` |
| Soumettre D2, passer la catégorie en affectation manuelle, approuver D2 sans choisir d'employé | D2 affectée à E1 (plus de blocage `ASSIGNEE_REQUIRED`, constat N1) |
| Soumettre D3, désactiver E1, approuver D3 | refus `AUTO_ASSIGNEE_UNAVAILABLE`, le sélecteur s'affiche ; approuver avec E3 → affectée à E3, source `MANAGER_CHOICE` |
| Soumettre D4, retirer E1 des destinataires de la catégorie (compte actif), approuver D4 | même comportement que D3 : refus puis choix du responsable (EXC-2, D8) |
| Demande ancienne (snapshot sans `autoAssigneeId`) | affectée selon la catégorie actuelle, source `CATEGORY_CURRENT` (EXC-1, D9) |

Dans l'historique de chaque demande, la ligne « Affectée à <nom> » est suivie de la source :
« (personne prévue à la soumission) », « (selon la catégorie actuelle, demande antérieure) » ou
« (choix du responsable) ».

Tests automatisés : test d'intégration écrit **avant** la correction (rouge sur les deux
premières lignes), puis vert ; voir [contracts/rest-api.md](./contracts/rest-api.md). Affichage
de la source : `frontend/tests/requests/HistoryTimeline.test.tsx`.

## Scénario 5 — Dépendances et nettoyage (US4, FR-012 à FR-016, SC-006, SC-007)

```bash
npm run -w backend test -- architecture-layers
npm run -w frontend test -- enums-sync
```

Attendu : vert. Contre-épreuve : ajouter temporairement dans `backend/src/files/` un import de
`../requests/...`, relancer → échec nommant le fichier ; annuler. Ajouter une valeur à
`RequestStatus` dans `schema.prisma` sans l'ajouter à l'interface → `enums-sync` échoue ;
annuler.

Non-régression : `npm test` complet, sans modification des attendus des tests d'accès aux
fichiers et aux demandes.

## Scénario 6 — Mise en production (US5, FR-017 à FR-021, SC-002, SC-008)

Sur la préproduction :

1. **Sauvegarde imposée** : ajouter une migration vide de test, lancer
   `docker compose … up -d --build` **sans** `deploy/deploy.sh` → l'API refuse de démarrer
   avec « Migration en attente sans sauvegarde récente… » ; lancer `deploy/deploy.sh` → une
   archive datée est créée puis la migration est appliquée. Les cas sont aussi couverts
   automatiquement par `backend/test/unit/api-entrypoint.spec.ts`.
   Puis `docker compose … ps` : le service `api` est `healthy` (le healthcheck interroge le port
   3000, fixé explicitement en production, FR-002).
2. **Restauration** : sur un serveur vierge, `deploy/backup/restore.sh <horodatage>` ;
   contrôler la connexion, une demande avec vocal et photo, le journal d'audit ; noter la durée
   dans `docs/validation/restauration.md`.
3. **En-têtes** : `curl -sI https://<domaine>/` et `/api/health` → présence de
   `Content-Security-Policy` et `Strict-Transport-Security` ; envoi d'un fichier de 27 Mo →
   refusé ; consigner dans `docs/validation/en-tetes-securite.md`.
4. **Contrôles qualité** : la CI GitHub est verte sur la branche ; `npm run test:e2e` lancé à la
   main, résultat consigné dans `docs/validation/`.
5. **Protection de branche** : sur GitHub, une demande de fusion vers `master` dont le contrôle
   « Contrôles qualité » échoue ne peut pas être fusionnée (réglage manuel, research R11).

## Clôture (FR-024, SC-009)

`docs/ARCHITECTURE.md` : chaque constat CT marqué corrigé avec sa référence de commit ; A04,
A11, A20, A23 à A26 re-marqués [VÉRIFIÉ] (confirmé ou infirmé) ; N1 et N2 ajoutés.
