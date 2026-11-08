# Data model: Déclaration d'une classe vide par QR code (013)

**No change.** No schema change, no migration, no new API route, no change to server rules.

## Existing request reused

`POST /api/coverage/empty-class` (`EmptyClassDto`):

| Field | Scan path (013) | Form path (unchanged) |
|---|---|---|
| `clientId` | UUID of the page, renewed after a success | same |
| `classId` | read from the QR token (`c1.<classId>.<version>.<signature>`) | chosen in the list |
| `teacherId` | `null` | chosen or `null` |
| `qrToken` | the scanned or pasted token | present only when the page was opened from a QR link (`?c=`) |

## Server checks (unchanged) and what the supervisor sees

| Check | Error code | Message (server catalog) |
|---|---|---|
| Not in the Surveillants group | `NOT_FOUND` | refusal, as today |
| Class missing or inactive | `CLASS_INACTIVE` | « Cette classe est introuvable ou désactivée. » |
| Bad signature, revoked or wrong version | `QR_INVALID` | « Ce QR code n'est pas valide ou a été révoqué. Demandez le QR code à jour. » |
| Token of another class than `classId` | `QR_CLASS_MISMATCH` | « Ce QR code correspond à une autre classe… » (cannot happen on the scan path: `classId` comes from the token) |

Outcomes on success (unchanged): `CREATED`, `SUPPORT`, `ATTACHED`, `ALREADY_ASSIGNED`, `MERGE_PROPOSED`; with
`teacherId: null`, an open teacher request for the class gives `MERGE_PROPOSED`, never `ATTACHED`.
