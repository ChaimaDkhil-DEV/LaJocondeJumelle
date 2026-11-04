# UI Contract — 006 Modification d'une affectation (Editing an assignment)

## « Modifier » (Edit) button (`/gardes/:id` detail)

- Visible to an admin or the super administrator when `allowedActions` contains `UPDATE`.
- Opens the « Modifier l'affectation » (Edit the assignment) dialog.

## « Modifier l'affectation » dialog

| Field | Label | Pre-filled with | Disabled when |
|-------|-------|-----------------|---------------|
| Class | « Classe » (list of active classes, with room and floor) | current class | `classId` absent from `modifiableFields` |
| Date | « Date » | current date (school time zone) | `date` absent |
| Start time | « Heure de début (HH:MM) » | current time | `startTime` absent |
| End time | « Heure de fin (HH:MM) » | current time | `endTime` absent |

- During attendance (only `endTime` editable): text « Le surveillant est en classe : seule
  l'heure de fin peut changer. » (The supervisor is in class: only the end time can change.)
- « Annuler » (Cancel) and « Enregistrer » (Save) buttons. « Enregistrer » sends only the changed fields.
- Field errors (`VALIDATION_ERROR`, `INVALID_RANGE`) under the relevant field; conflict
  (`NOT_AVAILABLE`) and other refusals in a dialog alert, server message as is;
  `STATE_CHANGED`: alert then reload of the detail.
- Success: dialog closed, toast « Affectation modifiée. » (announced), detail refreshed. Success
  and error feedback at the mutation level (the component may be unmounted before the response).
- Accessibility: the dialog's accessible name = its title; focus on the first editable field;
  tab order of the fields then the buttons; fits in 320 px with no horizontal scrolling.

## Assignment history

`UPDATED` event changed by an admin: « Affectation modifiée : classe 2e année Bleu → 1ère
année Violet ; 09:00–10:00 → 09:30–10:30 » (only the changed items; dates shown if the
day changes). Generic label « Affectation modifiée » instead of « Demande modifiée » (Request modified).

## Notification

Label of the `COVERAGE_UPDATED` type: « Affectation modifiée » (was « Demande modifiée »).
Existing display: « Affectation modifiée — <titre> », the title carrying the new class.

## Supervisor and teacher side

No new screen: « Mes affectations » (My assignments, supervisor) and « Mes signalements » (My reports, teacher)
display the new class and the new slot, updated in real time.
