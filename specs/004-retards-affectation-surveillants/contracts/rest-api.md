# Contrat REST — 004 (module affectations)

Préfixe `/api`, session cookie `sid` (inchangé), JSON, erreurs au format existant
`{ code, message, details? }`. Toutes les règles sont vérifiées **côté serveur** ; tout refus est
journalisé (`ACCESS_DENIED`) et répond `404` quand la ressource n'est pas visible de l'appelant
(principe V : ne pas révéler l'existence). Les écritures portent `version` (verrouillage
optimiste, `409 STATE_CHANGED`) et les créations un `clientId` (idempotence, inchangé).

Rôles : **SA** super administrateur · **AD** admin (ex-responsable) · **SV** membre du groupe
`SUPERVISORS` · **EN** membre du groupe `TEACHERS`. SA passe tous les contrôles de rôle du module
(FR-004b). Les autres employés reçoivent `404` sur tout le module (FR-023b).

## Affectations

### `POST /coverage/teacher-requests` — EN (FR-012, FR-013)

```json
{ "clientId": "uuid", "type": "LATENESS|ABSENCE", "classId": "uuid",
  "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM", "durationMinutes": 55,
  "reason": "texte facultatif ≤ 1000" }
```

`endTime` **ou** `durationMinutes`. Date = aujourd'hui ou demain (fuseau de l'école) ; plage non
entièrement passée ; fin > début. `201` → `CoverageDetail` (vue enseignant). Erreurs `400
INVALID_DATE`, `INVALID_RANGE`, `CLASS_INACTIVE`.

### `PATCH /coverage/:id/teacher-request` — EN auteur, statut `PENDING` (FR-008g)

Mêmes champs (partiels) + `version`. `409 NOT_PENDING` si déjà assignée.

### `POST /coverage/empty-class` — SV (FR-015 à FR-015j)

```json
{ "clientId": "uuid", "classId": "uuid", "teacherId": "uuid|null", "qrToken": "facultatif" }
```

`201` →

```json
{ "outcome": "CREATED|ATTACHED|ALREADY_ASSIGNED|SUPPORT|MERGE_PROPOSED",
  "coverage": { "...": "vue surveillant" },
  "assignedTo": { "id": "uuid", "displayName": "..." },
  "doubleAssignment": false }
```

Jamais bloquée par `teacherId` absent. `teacherId` doit désigner un membre de `TEACHERS`.

### `POST /coverage` — AD (affectation directe, FR-019) — **modifié**

```json
{ "clientId": "uuid", "classId": "uuid", "type": "LATENESS|ABSENCE|EMPTY_CLASS",
  "teacherId": "uuid|null", "startAt": "ISO", "endAt": "ISO", "assigneeId": "uuid",
  "reason": "facultatif", "note": "facultatif", "voiceFileId": "facultatif" }
```

Naît `ACCEPTED`, source `ADMIN_DIRECT`. `assigneeId` doit être disponible (`409
NOT_AVAILABLE`, sans forçage). **Retirés** : `groupIds`, `categoryId` (catégorie de garde
résolue côté serveur), `estimatedMinutes`, `absentTeacher`.

### `GET /coverage` — AD · `GET /coverage/mine` — SV · `GET /coverage/my-requests` — EN

Filtres : `mainStatus` (`PENDING|ASSIGNED|IN_PROGRESS|DONE|CANCELLED|UNFILLED`, multiples),
`source`, `type`, `floorId`, `classId`, `teacherId` (AD), `from`, `to`. Tri AD : `PENDING` dont le
délai a expiré d'abord (« affichée en priorité », FR-011e), puis par `startAt`. Chaque élément
porte `status` (technique), `mainStatus`, `subState`, `source`, `type`, `floor`, `class`,
`teacher` (AD/SA ; SV : nom seulement), `assignee`, `supports[]`, `alerts[]`.

### `GET /coverage/:id`

Vue selon l'acteur : **AD/SA** complète (dont `reason`) ; **SV affecté ou en renfort** : classe,
étage, créneau, type, statut — jamais `reason` (FR-023c) ; **EN auteur** : sa demande, sans
historique des autres acteurs au-delà du statut et du nom du surveillant.

### `GET /coverage/:id/candidates` — AD — **modifié**

Membres actifs de `SUPERVISORS`, triés : étage de la classe d'abord, puis disponibles. Chaque
candidat : `available` et `reason` (`INACTIVE|ABSENT|UNAVAILABLE|ON_GUARD|SUPPORT`). Les
indisponibles sont listés pour information mais refusés à l'assignation (FR-010).

### `POST /coverage/:id/actions` — **modifié**

`{ "action": "...", "version": 3, ...paramètres }`

| Action | Acteur | Paramètres |
| --- | --- | --- |
| `ASSIGN`, `REASSIGN` | AD | `assigneeId` |
| `CANCEL` | AD | `reason?` |
| `WITHDRAW` | EN auteur | `reason?` |
| `SET_TEACHER` | AD | `teacherId \| null` |
| `RELEASE_SUPPORT` | AD | `supportId` |
| `DEPART`, `CONFIRM_PRESENCE` | SV affecté | `photoFileId?`, `qrToken?` (inchangé) |
| `REQUEST_RELIEF` | SV affecté | `reason` (inchangé) |
| `RELIEVE` (« Terminer ») | SV affecté | — |
| `RELEASE_BY_MANAGER`, `VALIDATE` | AD | inchangé |
| `EXTEND` | AD, SV affecté | `minutes` (inchangé) |

**Retirées** : `ACCEPT`, `WIDEN`, `RELEASE` → `400 UNKNOWN_ACTION`. Le paramètre `force` est
retiré.

### Retiré

`GET /coverage/open` (onglet « À prendre ») → `404`.

## Doublons

- `GET /coverage/merge-proposals?status=PENDING` — AD. Paires avec les deux affectations
  résumées et `unresolved` (« non tranché »).
- `POST /coverage/merge-proposals/:id/decision` — AD — `{ "decision": "CONFIRM|REJECT" }`.
  Possible à tout moment, y compris après coup (FR-015h) ; `200` avec les deux affectations à jour.

## Statistiques — AD/SA (FR-022)

`GET /coverage/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=teacher|class|period&period=week|month`

```json
{ "totals": { "events": 0, "lateness": 0, "absence": 0, "emptyClass": 0,
              "cancelled": 0, "unfilled": 0, "unfilledRate": 0.0,
              "averageDurationMinutes": 0, "undecidedDuplicates": 0 },
  "rows": [ { "key": "...", "label": "Enseignant non précisé", "events": 0, "...": 0 } ] }
```

Aucun export (hors périmètre).

## Administration — SA uniquement

- `GET|POST /admin/floors`, `PATCH /admin/floors/:id` (nom, position, actif) — audit
  `FLOOR_CHANGED`. Réponse avec `supervisorCount` et `warning: "NO_SUPERVISOR"` si 0 (FR-006a).
- `POST|PATCH /admin/coverage/classes` — **modifié** : `floorId` obligatoire.
- `POST|PATCH /admin/users` — **modifié** : `floorId` facultatif (surveillant).
- `GET|PATCH /admin/settings` — nouvelles clés `coverage*` (data-model §3).
- Groupes : un groupe à `systemKey` ne peut être ni supprimé ni désactivé (`409 SYSTEM_GROUP`).

## Rôle

Les réponses exposant un rôle emploient `ADMIN` au lieu de `MANAGER`. `GET /settings/client` et
les DTO d'utilisateurs suivent (enum synchronisé avec l'interface).
