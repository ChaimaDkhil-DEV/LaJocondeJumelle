# UI contract: Déclaration d'une classe vide par QR code (013)

## Page « Déclarer une classe vide » (`/gardes/classe-vide`)

Order, top to bottom:

1. Page header « Déclarer une classe vide » (unchanged, back link « Mes affectations »).
2. **Scan block** (new): button « Scanner le QR code de la classe » (contained, large, QR icon), with the text
   « La déclaration part dès que le QR code de la porte est lu. »
3. Refusal alert (when the last scan was refused): the server message, `role="alert"`.
4. Separator « ou » and the **current form**, unchanged (class, optional teacher, « Déclarer la classe vide »).

When the page was opened from a QR link (`?c=…`, phone-camera path), the form keeps its current behaviour (class
preselected, QR sent with the form); the scan block stays available.

## Scanning window (existing `QrScannerDialog`)

- Title « Scanner le QR code de la classe »; camera view inside the page (back camera); manual field « Lien ou code
  du QR code » + « Continuer »; « Fermer ».
- Camera refused / absent: the existing info message; the manual field remains.
- QR code that is not a class QR code: « Ce QR code n'est pas celui d'une classe. »; scanning continues.
- First valid class QR code read (or pasted): the window closes and the declaration is sent.

## While sending

`LoadingState` « Déclaration de la classe… » in place of the page content.

## Result (existing view, completed)

- Heading (`h2`) with the class name, e.g. « CE1 Vert ».
- The existing outcome alert and double-assignment warning, unchanged.
- Buttons: « Voir l'affectation » (when an assignment exists), « Scanner une autre classe » (opens the window
  again with a new declaration id), « Déclarer une autre classe » (back to the page, unchanged).

## Phone-camera path (`/gardes/presence?c=…`)

Unchanged: no declaration before the click on « Déclarer cette classe vide ».

## Accessibility

Keyboard reachable buttons; the camera is optional (manual field); status and alerts announced (`role="status"`,
`role="alert"`); 320 px without horizontal scroll; axe clean in Playwright.

## English labels

« Scan the class QR code », « The declaration is sent as soon as the door QR code is read. », « or »,
« Declaring the class… », « Scan another class ».
