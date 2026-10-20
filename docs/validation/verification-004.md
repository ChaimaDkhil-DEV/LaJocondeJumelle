# Vérification de la fonctionnalité 004 — retards et absences des enseignants, affectation des surveillants

- **Branche** : `004-retards-affectation-surveillants`
- **Poste** : Windows 11, Node.js 24.21, PostgreSQL 17 embarqué (embedded-postgres)

## État initial (T001)

- **Date** : 20 octobre 2026
- **Commit** : `aa76140` (documents de conception seuls, aucun code modifié). La branche a été
  rebasée sur `master` (`38b968f`, PR #17). `master` contient désormais
  `0006_request_event_dashboard_indexes` (PR #13) et `0007_audit_request_actions` (PR #17) : les
  migrations de la fonctionnalité sont renumérotées `0008_supervision_schema` et
  `0009_supervision_data` dans tous les documents de conception.

| Commande | Code de sortie | Résultat |
|----------|----------------|----------|
| `npm run lint` | 0 | aucun problème |
| `npm run -w backend typecheck` | 0 | aucune erreur |
| `npm run -w frontend typecheck` | 0 | aucune erreur |
| `npm run -w backend test` (unitaires) | 0 | 431 / 431 ; 24 suites |
| `npm run -w backend test:integration` | 0 | 313 / 313 ; 29 suites (133 s) |
| `npm run -w frontend test` | 0 | 159 / 159 ; 21 fichiers |

**Remarque d'environnement** : dans une copie de travail neuve (`git worktree`), `npm ci` ne
génère pas le client Prisma. Le premier passage du typage backend et des tests d'intégration
échoue alors (types `@prisma/client` absents, enums `undefined`). Après
`npm exec -w backend -- prisma generate`, les deux passent ; les résultats ci-dessus sont ceux du
second passage. Aucun code n'est en cause.

**Aucun échec.**

## Phase 2 — socle (T004 à T039)

### Ordre TDD et constat « rouge »

- **T004 à T009** (unitaires) : écrits d'abord, 74 échecs constatés avant le code, puis verts.
- **T010** (migrations) : rouge sur l'absence des dossiers `0008`/`0009`, puis 15 / 15.
- **T017** (pré-contrôle) : rouge sur le module absent, puis 6 / 6.
- **T011, T012, T013** : écrits avant le code des services, mais pendant la réécriture l'API ne
  compilait plus ; ils n'ont donc été vus rouges que par compilation, pas sur un comportement.
  Ils sont verts dès que le backend recompile.

### Décisions d'implémentation

- **T011 — refus des routes `/admin/floors`** : 403 et `ACCESS_DENIED` (`NOT_SUPER_ADMIN`), comme
  toutes les routes `/admin/*` (`SuperAdminGuard`), et non 404 comme l'indique la tâche. Le 404
  « hors périmètre » s'applique au module des affectations (`/coverage/*`), qui le respecte.
- **Groupes à clé système** : tout compte actif peut être membre (un admin enseignant, un super
  administrateur surveillant, R7, FR-004b) ; auparavant, seuls les comptes de rôle employé.
- **Action `CANCEL`** : l'acteur SYSTEM est ajouté pour annuler une relève en cascade quand
  l'affectation d'origine se termine (comportement existant conservé).
- **Rappel de clôture** : le job revérifie l'échéance réelle (fin prolongée, ou fin de journée locale
  pour une garde « jusqu'à l'arrivée ») et repousse la ligne au lieu d'envoyer trop tôt (FR-016a).
- **Relève** : une demande de relève crée une affectation « en attente » (source `ADMIN_DIRECT`, avec
  délai de prise en charge) ; l'admin l'assigne. Plus de diffusion.
- **SQL des migrations** : limité à WIN1252 (PostgreSQL embarqué sous Windows) ; `0009` sans
  `BEGIN`/`COMMIT` explicites (Prisma l'exécute en une requête, donc en transaction implicite ; un
  bloc explicite masquait le message des garde-fous). Fuseau `Europe/Paris` dans le SQL de `0009`.

### Tests supprimés ou remplacés (diffusion supprimée, FR-011a)

`backend/test/integration/coverage.spec.ts` (T038) :

| Cas d'origine | Sort | Raison |
| --- | --- | --- |
| 2. concurrence : deux employés acceptent en même temps | supprimé | plus d'acceptation par un volontaire ; la sérialisation des assignations reste (verrou par surveillant) |
| limitation de débit sur « Je prends » | supprimé | action `ACCEPT` retirée (400 `UNKNOWN_ACTION`, cas 9) |
| 2 bis. « Déjà prise par [nom] » | supprimé | plus de vue réduite pour les membres d'un groupe ciblé |
| 3. employé hors groupe cible ne peut accepter | remplacé | employé hors module : 404 et refus journalisé |
| 4. employé déjà en garde ne peut accepter | remplacé | surveillant occupé non assignable (`NOT_AVAILABLE`) |
| 4 bis. affectation forcée par le responsable | remplacé | plus de forçage : `force` refusé (400), cas 4 et T012 |
| 5. désistement et rediffusion | supprimé | action `RELEASE` retirée (FR-008f) |
| 6. aucun preneur : non pourvue, groupe relancé | remplacé | « non pourvue » en fin de créneau sans assignation : T013 |
| les employés voient disparaître une garde prise (`coverage:taken`) | supprimé | événement retiré (contracts/realtime-events.md) |
| groupe vide : avertissement, élargissement (`WIDEN`) | supprimé | plus de groupes ciblés ni d'élargissement |

Ajoutés dans le même fichier : assignation d'une demande en attente (surveillant et enseignant
notifiés, FR-017a) ; prolongation avec rappel de clôture recalculé.

`backend/test/unit/coverage-policy.spec.ts` : cas « rediffusion : délai de prise en charge »
supprimé (diffusion retirée ; le délai de prise en charge est une échéance `CoverageReminder`).

`backend/test/integration/coverage-work-isolation.spec.ts` (T039) : la garde de référence est
créée par affectation directe (statut `ACCEPTED` au lieu de `BROADCAST`) ; attendus des demandes
de travail inchangés. `notifications.spec.ts` et `realtime.spec.ts` : verts sans modification.

### Résultat

`npm run lint` sans erreur ; typage backend et frontend sans erreur ; unitaires backend 546 / 546 ;
intégration 366 / 366 (34 suites) ; frontend 159 / 159.

## Phase 2 — interface (T033, T036, T040, T041)

- **T041** (`status-badges.test.tsx`) et **T036** (`floors.test.tsx`) : écrits d'abord, rouges
  (18 et 5 échecs), puis verts. Deux attendus de `floors.test.tsx` corrigés après coup : attente
  du chargement de la liste, et fermeture du dialogue au lieu du message du Toast (le
  `ToastProvider` n'est pas monté dans ce harnais, comme pour les autres écrans d'administration).
- **T040** (`coverage.test.tsx`) : réécrit avant le code, mais non exécuté entre les deux ; il
  référençait des types absents et n'aurait échoué que par compilation.
- **Écran de création** : `CreateCoveragePage.tsx` (diffusion à des groupes) et la route
  `/gardes/nouvelle` sont retirés ; l'affectation directe sera réécrite en T074 (US3). D'ici là,
  l'admin assigne les demandes en attente depuis leur détail.

`frontend/tests/coverage/coverage.test.tsx` (T040) — cas supprimés ou remplacés :

| Cas d'origine | Sort | Raison |
| --- | --- | --- |
| désistement : motif obligatoire | remplacé | désistement retiré (FR-008f) ; même contrôle sur la demande de relève |
| affectation forcée d'un employé déjà en garde | remplacé | plus de forçage : indisponibles listés mais non sélectionnables |
| onglet « À prendre » : « Je prends », course perdue | supprimé | diffusion supprimée (FR-011a) |
| bouton « Je prends » désactivé | supprimé | idem |
| détail « Déjà prise par [nom] » | supprimé | plus de vue réduite |
| création rapide : groupe sans disponible | supprimé | création par diffusion retirée ; affectation directe en T071/T074 |

Ajoutés : onglets du surveillant (« Mes affectations », « Historique »), annulation par l'admin
avec motif facultatif.

Résultat : lint sans erreur ; typage frontend sans erreur ; frontend 180 / 180 (23 fichiers).
