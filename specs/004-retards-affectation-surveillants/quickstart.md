# Quickstart — validation de 004

Guide de vérification de bout en bout. Modèle : [data-model.md](./data-model.md) ; API :
[contracts/rest-api.md](./contracts/rest-api.md) ; migration :
[contracts/migration.md](./contracts/migration.md).

## Prérequis

- Node.js 24, dépendances installées (`npm ci` à la racine).
- Base de développement : `npm run db:dev -w backend`, puis `npm run prisma:deploy -w backend`
  et `npm run prisma:seed -w backend`.
- `SCHOOL_TIMEZONE` défini (défaut `Europe/Paris`).
- Comptes du seed : `superadmin`, **`admin`** (ex-`responsable`), `enseignante` (groupe
  Enseignants), `surveillant` et un second surveillant (groupe Surveillants, étages différents),
  `reprographie` (aucun accès au module). Étages « 1er étage » et « 2e étage » ; classes
  rattachées.
- Lancement : `start.bat` (API sur 3002 + interface).

## Tests automatisés

```text
npm test -w backend                    # unitaires (machine d'états, statut principal, échéances, fuseau)
npm run test:integration -w backend    # parcours, droits, migration 0004/0005 + down, jobs, anonymisation
npm test -w frontend                   # écrans, accessibilité, synchronisation des enums
npx playwright test -c e2e/playwright.config.ts   # 3 parcours à 360, 768 et 1280 px
```

Attendu : tout au vert, y compris les tests existants adaptés (diffusion retirée).

## Scénarios manuels

| # | Parcours | Étapes | Attendu |
| --- | --- | --- | --- |
| 1 | Demande enseignant (US1) | `enseignante` signale un retard demain 08:00–09:00, classe du 1er étage, motif « RDV médical » | « en attente » ; `admin` notifié ; rappel prévu à 07:00 |
| 2 | Assignation | `admin` ouvre la demande ; candidats : surveillants du 1er étage en tête, indisponibles marqués | assignation → « assignée » ; `surveillant` notifié ; `enseignante` notifiée ; le surveillant ne voit **pas** le motif |
| 3 | Délai court | demande pour aujourd'hui dans 30 min, ne rien faire 2 min, puis 5 min | alerte URGENT à `admin`, puis escalade à `superadmin` ; demande en tête de liste |
| 4 | Classe vide (US2) | `surveillant` déclare une classe vide sans enseignant | « en cours » immédiat ; alerte mise en évidence chez `admin` (visuelle, son facultatif) |
| 5 | Doublon | second surveillant déclare la même classe | rattaché en renfort ; `admin` décide ; rappels toutes les 10 min, 3 au plus, puis `superadmin` |
| 6 | Affectation directe (US3) | `admin` crée une affectation avec un surveillant déjà occupé | refus « non disponible » ; avec un disponible : « assignée » |
| 7 | Réassignation en cours | `admin` réassigne l'affectation du scénario 4 | relève assignée ; l'ancien n'est libéré qu'à la présence du nouveau |
| 8 | Non pourvue | demande jamais assignée, fin de créneau passée | « non pourvue » ; comptée à part dans les statistiques |
| 9 | Droits | `reprographie` ouvre `/gardes` ; `surveillant` tente `ASSIGN` par l'API | rien de visible ; `404`/`403` journalisé |
| 10 | Rôle | `admin` se connecte | libellé « Admin » ; espace super administrateur libellé « Administrateur » ; circuit B et catégories inchangés |
| 11 | Statistiques (US5) | `admin` ouvre les statistiques du mois | retards par enseignant/classe, durée moyenne, taux de non pourvue, annulées et « non tranchés » à part |

## Migration (préproduction)

1. Copie de la base de production en préproduction.
2. `npm run preflight:supervision -w backend` → rapport ; validations V1–V3 consignées.
3. Déploiement (`deploy/deploy.sh`) : sauvegarde, `0004`, `0005`.
4. Contrôles : gardes `BROADCAST` devenues « en attente » chez l'admin ; anciennes gardes
   terminées affichées « terminée » avec badge ; aucun événement d'historique disparu
   (décompte `RequestEvent` avant/après : seulement des ajouts).
5. Retour arrière à blanc : `0005/down.sql`, `0004/down.sql`, contrôle de l'état initial.
