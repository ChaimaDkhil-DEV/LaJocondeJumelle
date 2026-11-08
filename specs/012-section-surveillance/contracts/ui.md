# UI contract: Section « Surveillance » (012)

## Menu and titles

| Place | Before | After (fr) | After (en) |
|---|---|---|---|
| Menu entry | Gardes | Surveillance | Supervision |
| Page title (`/gardes`) | Gardes de classe | Surveillance | Supervision |
| Back links (detail, new assignment, statistics) | Gardes | Surveillance | Supervision |
| Tab list label | Gardes | Surveillance | Supervision |

Visibility of the menu entry unchanged (`canSeeCoverage`). Paths unchanged.

## Tabs of an admin or the super administrator (`canManage`)

| Order | Label | `onglet` | Content |
|---|---|---|---|
| 1 (default) | Absences et retards | `absences-retards` | former « Présences » (`AttendanceFollowUpTab`), unchanged |
| 2 | Affectation des surveillants | `affectation` | « Nouvelle affectation » button; `h2` « À assigner » (`#a-assigner`) + waiting queue; `h2` « Doublons possibles » (`#doublons`) + duplicates; `h2` « Équipe » (`#equipe`) + team |
| 3 | Suivi des interventions | `suivi` | filter group « Filtrer les interventions »: « En attente » (`en-attente`), « Prise en charge » (`prise-en-charge`, default), « Terminée » (`terminee`); rows as today |

Then, for an admin also in a group, the group tabs as today (teacher: « Mes signalements »,
« Mes présences »; supervisor: « Mes affectations », « Historique »).

Former keys are mapped (research R4) and the address rewritten without a history entry. An unknown key
opens the first tab, as today.

## Header actions

| Action | Admin | Teacher | Supervisor |
|---|---|---|---|
| Nouvelle affectation | moved into « Affectation des surveillants » | — | — |
| Statistiques | header (unchanged) | — | — |
| Déclarer une classe vide | header if `declareEmptyClass` (unchanged) | — | header (unchanged) |
| Signaler un retard ou une absence | header if teacher (unchanged) | header (unchanged) | — |

## Accessibility

- Tabs: MUI `Tabs`/`Tab` with `role="tablist"`/`tab`/`tabpanel` (unchanged mechanism).
- Filter: exclusive `ToggleButtonGroup`, `aria-label="Filtrer les interventions"`, each button
  `aria-pressed`; keyboard reachable; labels as text.
- Each part of « Affectation des surveillants » has an `h2`.
- 320 px: tabs scrollable (as today), filter buttons wrap; no horizontal page scroll; axe clean (Playwright).

## English labels

« Absences and lateness », « Supervisor assignment », « Intervention tracking », « To assign »,
« Possible duplicates », « Team », « Filter interventions », « Pending », « Taken over », « Finished ».
