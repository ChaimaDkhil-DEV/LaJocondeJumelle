# Contrat de migration — 004

Objectif : passer de la diffusion des gardes au module d'affectations **sans perte de données**,
en étapes **réversibles**, avec l'historique et l'audit intacts (principe V). Décisions :
[research.md](../research.md) R1, R7, R8, R12, R13.

## Étape 0 — Pré-contrôle (lecture seule)

`npm run preflight:supervision -w backend` (script `backend/scripts/supervision-preflight.ts`,
`DATABASE_URL` de la base cible) produit `supervision-preflight-<date>.md` :

| Section | Contenu | Validation humaine demandée |
| --- | --- | --- |
| A. Membres du groupe | Membres de « Surveillants/Remplaçants » : nom, identifiant, intitulé de poste, rôle | **V1** — l'établissement indique les non-surveillants (FR-005a). Ils restent membres (aucun retrait automatique) ; le retrait éventuel se fait ensuite dans l'administration, audité. |
| B. Statuts | Décompte des gardes par statut et statut cible (R1) ; liste nominative des gardes **sans équivalent évident** | **V2** — décision pour chaque garde listée (FR-008d). La migration 0005 refuse de s'exécuter s'il en reste. |
| C. Conservation | Durée proposée (12 mois glissants), nombre d'affectations anonymisées dès la première exécution | **V3** — validation par la direction (FR-023a) ; la valeur validée est saisie dans le réglage `coverageRetentionMonths` juste après la migration, avant l'activation des jobs. |

Les trois validations sont consignées (nom, date) dans le rapport, joint à la demande de mise en
production. Sans elles, pas de déploiement.

Statut « sans équivalent évident » : statut de garde absent du tableau R1, garde `COVERAGE`
portant un statut de demande de travail, ou `UNFILLED` dont la fin de créneau est inconnue et la
journée non terminée.

## Étape 1 — `0004_supervision_schema` (additive)

- `ALTER TYPE … ADD VALUE` : `RequestStatus.PENDING`, nouveaux `RequestEventType`,
  `NotificationType`, `AuditAction`.
- `CREATE TYPE` : `CoverageSource`, `CoverageType`, `GroupSystemKey`, `CoverageReminderKind`,
  `MergeProposalStatus`.
- `CREATE TABLE` : `Floor`, `CoverageSupport`, `CoverageMergeProposal`, `CoverageReminder`.
- `ADD COLUMN` (nullables) : `CoverageDetail.source|type|teacherId|reason|floorId|mergedIntoId|anonymizedAt`,
  `SchoolClass.floorId`, `User.floorId`, `EmployeeGroup.systemKey` (+ index uniques).
- Aucune donnée modifiée. `down.sql` : refuse s'il existe des lignes dans les nouvelles tables ou
  des colonnes nouvelles renseignées ; sinon retire tables et colonnes et recrée les types sans
  les valeurs ajoutées (même méthode que `0002_coverage/down.sql`).

## Étape 2 — `0005_supervision_data` (données, une transaction)

1. **Garde-fou** : `DO $$ … RAISE EXCEPTION` si une garde sans équivalent (V2) subsiste.
2. **Rôle** : `ALTER TYPE "Role" RENAME VALUE 'MANAGER' TO 'ADMIN'`.
3. **Groupes** : « Surveillants/Remplaçants » → nom « Surveillants », `systemKey = SUPERVISORS`
   (membres conservés) ; création de « Enseignants » (`TEACHERS`), vide. Si un groupe porte déjà
   le nom cible, la migration s'arrête (décision humaine).
4. **Gardes ouvertes** : `BROADCAST` → `PENDING` ; `UNFILLED` dont la fin de créneau n'est pas
   passée → `PENDING` ; `UNFILLED` passées : inchangées (FR-011c). Pour chaque ligne modifiée :
   `RequestEvent STATUS_CHANGED` (acteur SYSTEM, `fromValue`/`toValue`, commentaire
   `migration-0005`) ; `currentStage/currentDueAt` remis à null (l'étape `TAKEOVER` disparaît) ;
   une ligne `CoverageReminder TAKEOVER` est créée selon R3.
5. **Source** : `CoverageDetail.source = ADMIN_DIRECT` pour toutes les gardes existantes ;
   `type` laissé null (inconnu), `absentTeacher` conservé.
6. **Compte de démonstration** : `responsable` → `admin` seulement si `admin` est libre et si
   le nom affiché est celui du seed ; sinon rien.
7. **Compte technique** `enseignant-anonymise` (inactif, rôle `EMPLOYEE`, mot de passe
   inutilisable) créé pour l'anonymisation.
8. **Réglages** : clés `coverage*` insérées avec leurs valeurs par défaut.

Les autres statuts ne changent pas en base : leur statut principal et leur sous-état sont
calculés (R1). Aucune ligne de `RequestEvent` ni d'`AuditLog` n'est modifiée ni supprimée.

`down.sql` (manuel, `npx prisma db execute --file …`) :

- refuse s'il existe des affectations créées après la migration (source `TEACHER_REQUEST` ou
  `SUPERVISOR_REPORT`, ou `PENDING` sans événement `migration-0005`) ;
- remet `PENDING` → statut d'origine d'après les événements `migration-0005`, en **ajoutant**
  des événements inverses `migration-0005-down` ;
- `ADMIN` → `MANAGER`, groupes renommés à l'identique, `systemKey` à null, groupe « Enseignants »
  supprimé s'il est vide, compte de démo renommé à l'identique, compte technique supprimé s'il
  n'est référencé par aucune demande, réglages `coverage*` supprimés, lignes `CoverageReminder`
  supprimées ;
- retire la ligne `0005_supervision_data` de `_prisma_migrations`.

## Étape 3 — Déploiement

1. Rapport de pré-contrôle et validations V1–V3 joints.
2. `deploy/deploy.sh` : sauvegarde (`backup.sh`, existant), reconstruction des images.
3. `deploy/api-entrypoint.sh` (existant) : refuse sans sauvegarde de moins de 60 min ; applique
   `0004` puis `0005` (`migrate deploy`) ; démarre l'API.
4. Juste après : saisie de `coverageRetentionMonths` validé (V3) ; rattachement des classes à un
   étage et des surveillants à leur étage dans l'administration.

## Retour arrière

Code précédent redéployé, puis `0005/down.sql`, puis `0004/down.sql`. En cas de refus des
garde-fous (données nouvelles déjà saisies) : restauration de la sauvegarde prise à l'étape 3
(`deploy/backup/restore.sh`, existant).

## Vérification de la migration (tests)

Test d'intégration `migration-0005.spec.ts` sur PostgreSQL embarqué : base en état `0003` +
jeu de gardes dans chaque statut → `0004` + `0005` → contrôle des statuts, événements
`migration-0005`, groupes, rôle, compte de démo ; puis `down.sql` → état initial restauré, aucun
événement supprimé, garde-fous déclenchés sur données nouvelles.
