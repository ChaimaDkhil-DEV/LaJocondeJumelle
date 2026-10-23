# Research: Export des statistiques des affectations

Constats sur l'existant (23/10/2026) et décisions de conception.

## R1 — Export produit par le serveur

- **Décision** : nouvelle route `GET /api/coverage/stats/export.csv`, mêmes paramètres que
  `GET /api/coverage/stats`. Le service réutilise `CoverageStatsService.stats` (même contrôle
  d'accès, mêmes contrôles de période, même calcul) puis met le résultat en forme avec
  `toCsv` (`backend/src/common/csv.ts`).
- **Pourquoi** : la journalisation de chaque export réussi (FR-009, clarification A) et le
  contrôle d'accès (FR-006) se font côté serveur ; les deux exports existants (tableau de bord,
  suivi des gardes) suivent déjà ce modèle (`@Get('export.csv')`, `toCsv` : séparateur « ; »,
  UTF-8 avec BOM, CRLF, formules neutralisées), ce qui couvre FR-004 sans code nouveau.
- **Alternatives rejetées** : fichier construit dans le navigateur à partir des données déjà
  chargées (valeurs identiques par construction, mais il faudrait un second appel pour
  journaliser, sans garantie que l'export ait bien eu lieu, et un second format CSV à maintenir
  côté interface) ; paramètre `format=csv` sur `GET /api/coverage/stats` (mélange JSON et
  fichier sur une même route ; le test existant refuse ce paramètre, R6).

## R2 — Valeurs identiques à la page (FR-003, SC-002)

- **Décision** : une fonction pure `statsToCsvRows` (domaine, `backend/src/coverage/domain/`)
  transforme le résultat de `computeCoverageStats` en lignes, avec les mêmes règles d'affichage
  que la page :
  - durée moyenne : même règle que `formatDuration` (`frontend/src/features/coverage/labels.tsx`) —
    « 45 min », « 1 h », « 1 h 05 » ; cellule vide quand elle n'est pas calculable (« — » sur la
    page) ;
  - taux de non pourvue : `Math.round(rate * 100)` suivi de « % », comme `percent` de
    `CoverageStatsPage.tsx` ;
  - libellés de lignes : ceux renvoyés par `computeCoverageStats` (« Enseignant anonymisé »,
    « Enseignant non précisé », « Semaine du JJ/MM/AAAA », mois en toutes lettres), sans
    retraitement.
- **Pourquoi** : le calcul est déjà fait une seule fois côté serveur ; seule la mise en forme est
  dupliquée, et elle est courte et figée par des tests unitaires qui reprennent les cas de
  `formatDuration` (R7).
- **Alternative rejetée** : exporter les minutes brutes et le taux décimal (plus pratique dans un
  tableur, mais contraire à FR-003 : valeurs identiques à la page).

## R3 — Disposition du fichier

- **Décision** : un seul tableau, lisible dans un tableur, colonnes fixes :

  1. ligne d'en-tête : libellé du regroupement (« Enseignant », « Classe » ou « Période »), puis
     « Événements », « Retards », « Absences », « Classes vides », « Non pourvues », « Annulées »,
     « Durée moyenne » (mêmes libellés et même ordre que le tableau de la page) ;
  2. une ligne par élément, dans l'ordre de la page ;
  3. une ligne « Total de la période » avec les mêmes colonnes ;
  4. une ligne vide, puis des lignes « libellé ; valeur » : « Du », « Au », « Fuseau »,
     « Regroupement » (et « Période » : « Semaine » ou « Mois »), « Taux de non pourvue »,
     « Doublons non tranchés (comptés une fois) ».

  Les sept indicateurs des totaux de la page sont tous présents : « Retards et absences » est la
  colonne « Événements » de la ligne de total, le taux et les doublons sont dans le bloc final ;
  « Annulées » figure dans la ligne de total.
- **Pourquoi** : le tableau commence en A1 (filtre et tri directs dans un tableur) ; le bloc
  final donne le contexte sans décaler les colonnes.
- **Alternative rejetée** : bloc de contexte en tête de fichier (le tableau ne commence plus en
  A1) ; trois fichiers séparés (plusieurs téléchargements pour une seule action, SC-001).

## R4 — Nom du fichier (FR-005)

- **Décision** : `statistiques-affectations-<regroupement>-<du>-au-<au>.csv`, avec
  `<regroupement>` parmi `enseignant`, `classe`, `semaine`, `mois` (la granularité remplace
  « période »). En-tête `Content-Disposition: attachment; filename="…"` posé par le contrôleur
  (`@Res({ passthrough: true })`), car le nom dépend de la requête ; les autres en-têtes
  (`Content-Type`, `Cache-Control: private, no-store`) sont ceux des exports existants.
- **Pourquoi** : uniquement des caractères ASCII sûrs (dates validées `AAAA-MM-JJ`, regroupement
  issu d'une liste fermée) : pas d'encodage `filename*` nécessaire.

## R5 — Journalisation (FR-009, clarification A)

- **Décision** : nouvelle valeur `COVERAGE_STATS_EXPORTED` de l'énumération `AuditAction`
  (migration `0010_audit_coverage_stats_export`), écrite par `AuditService.log` après la
  production du fichier : `actorId`, `ip`, `targetType: 'Request'`,
  `targetId: 'coverage-stats'` (comme le refus existant), `details` :
  `{ from, to, groupBy, period }` (`period` seulement pour le regroupement « Période »).
  Clés `from`, `to`, `groupBy`, `period` ajoutées à `ALLOWED_DETAIL_KEYS`
  (`backend/src/audit/audit.service.ts`) ; aucune valeur statistique, aucun nom.
  Libellé « Export des statistiques des affectations » dans `frontend/src/features/admin/labels.ts`
  (filtre et liste du journal).
- **Refus** : inchangés — `ACCESS_DENIED` (motif `NOT_COVERAGE_ADMIN`, route de l'export) par le
  contrôle existant de `stats` ; une période invalide (`INVALID_RANGE`, `400`) n'écrit rien.
- **Migration** : ajout de valeur d'énumération seul (comme `0007`, `0008`). `down.sql` sur le
  modèle de `0008_supervision_schema/down.sql` : arrêt si une entrée `COVERAGE_STATS_EXPORTED`
  existe (le journal d'audit ne se réécrit pas : restaurer la sauvegarde), sinon recréation de
  l'énumération sans la valeur et retrait de la ligne de suivi Prisma.
- **Alternative rejetée** : réutiliser une action existante (`COVERAGE_MANAGED`) avec un détail
  « export » (filtre du journal trompeur, libellé faux).

## R6 — Interface (FR-001, FR-008, FR-010)

- **Décision** : bouton-lien « Exporter (CSV) » (`Button component="a" href=… download`, icône
  `Download`, comme `CoverageDashboardPage.tsx:146`) dans l'en-tête des résultats, affiché
  seulement quand `stats.data` correspond aux filtres affichés (`!stats.isPlaceholderData`, dates
  complètes, pas d'erreur). L'adresse reprend exactement les paramètres de la requête affichée.
- **Pourquoi** : même comportement que l'export du suivi des gardes ; un lien est atteignable et
  activable au clavier sans code ; le masquer pendant le recalcul (`keepPreviousData`) évite
  d'exporter d'anciens filtres.
- **Erreurs** : le bouton n'apparaît que si la même requête vient de réussir ; un refus tardif
  (session expirée) donne la réponse JSON du serveur, comme les deux exports existants.
  Accepté (YAGNI).

## R7 — Tests (principe I)

- **Unitaires** (`backend/test/unit/coverage-stats-csv.spec.ts`, nouveau) : `statsToCsvRows`
  pour les trois regroupements et les deux granularités ; durées (`null`, < 60, heure pile,
  heure et minutes) ; taux arrondi ; libellés anonymisé / non précisé ; période vide.
- **Intégration** (`backend/test/integration/supervision-stats-export.spec.ts`, nouveau) :
  fichier téléchargé (en-têtes, nom), valeurs égales à `GET /api/coverage/stats` pour les mêmes
  paramètres (SC-002), formule neutralisée, BOM, refus `surveillant`/`enseignante` (404
  journalisé), `INVALID_RANGE` sans entrée d'export, entrée `COVERAGE_STATS_EXPORTED` avec ses
  détails et sans valeur statistique.
- **Test existant** : `supervision-stats.spec.ts` « période par défaut ; paramètres invalides
  refusés ; aucun export » garde ses attendus (`format=csv` → `400`,
  `/api/coverage/stats/export` → `404`, toujours vrais) ; seul son titre perd « aucun export »
  (exception consignée dans la vérification).
- **Interface** (`frontend/tests/coverage/stats.test.tsx`) : bouton présent avec la bonne adresse
  après le calcul, absent pendant une date incomplète, un recalcul ou une erreur ; libellé de
  l'action dans `frontend/tests/admin/role-labels.test.tsx` (qui couvre déjà les libellés
  d'audit).
- **E2E** : `e2e/a11y-responsive.spec.ts` (écran statistiques à 320 px : bouton visible, axe) ;
  `e2e/coverage-stats-export.spec.ts` (nouveau, Chromium) : téléchargement
  (`page.waitForEvent('download')`), nom du fichier, première ligne, entrée au journal d'audit.
