# Manual check on iPhone (T119)

**Status: to be carried out.** The automated WebKit tests use a simulated MediaRecorder
(Playwright's WebKit has neither a simulated microphone nor an AAC decoder on Windows): only a real iPhone
proves voice message recording and playback on Safari iOS.

## Preparation

- iPhone running **iOS 17 or later**, Safari.
- Application served over **HTTPS**: acceptance instance, or development machine with
  `docker compose -f deploy/docker-compose.dev.yml up caddy` then `https://<ip-du-poste>:8443`
  (accept the internal certificate on the iPhone).
- Accounts: `enseignante` (on the iPhone) and `reprographie` (on an Android phone with Chrome).
- A request containing a voice message **recorded on Chrome Android**, created beforehand.

## Checks

| # | Action on the iPhone | Expected result | Result | Remarks |
|---|---------------------|------------------|----------|-----------|
| 1 | New request → "Enregistrer un message vocal" (Record a voice message) | Safari asks for microphone permission; recording starts with a counter | | |
| 2 | Speak for 10 s then "Arrêter l'enregistrement" (Stop recording) | Duration shown; Lire (Play), Refaire (Redo), Supprimer (Delete) buttons | | |
| 3 | "Lire le message vocal" (Play the voice message) | Sound is audible and intelligible | | |
| 4 | "Refaire l'enregistrement" (Redo the recording), record 5 s | Only the new recording is kept (duration 0:05) | | |
| 5 | Choose category, recipient, priority, title → "Envoyer la demande" (Send the request) | "Votre demande a été envoyée." (Your request has been sent.), status "Envoyée" (Sent) | | |
| 6 | On Android (`reprographie`), play the voice message sent from the iPhone | Correct playback | | |
| 7 | On the iPhone, open the request with the voice message recorded on Chrome Android and play it | Correct playback (converted format `audio/mp4`) | | |
| 8 | In the thread, "Prendre une photo" (Take a photo) with the camera | Camera opened; photo attached, correct orientation | | |
| 9 | In the thread, attach a photo **from the gallery** (original HEIC photo) | Photo accepted (converted to JPEG by iOS) or a clear message if the format is refused | | |
| 10 | Deny microphone access (Réglages → Safari → Micro, i.e. Settings → Safari → Microphone) then try again | Message explaining how to allow the microphone; sending a written description remains possible | | |

## Report

- Date:
- iPhone model:
- iOS version:
- Safari version:
- Address tested (acceptance / development machine):
- Tester:
- Conclusion (compliant / anomalies):
- Anomalies (check number, description, screenshot):
