# Demo videos — super administrator

One video per scenario, recorded with Playwright (`recordVideo`), French subtitles burned in
by ffmpeg (white text on a semi-transparent background), visible cursor, pauses of 1 to 2 s. No
voice-over. The videos produced are not versioned (see `.gitignore`); the demo does not change the
application code.

## Running

From the repository root, with dependencies installed and ffmpeg available (on the PATH, or paths in
`FFMPEG_PATH` and `FFPROBE_PATH`, same values as in `backend/.env`):

```text
npx tsx demo/run.ts all --env=test              all scenarios + compiled video
npx tsx demo/run.ts S12 --env=test              a single scenario
npx tsx demo/run.ts S01 S05 --env=test          several scenarios
npx tsx demo/run.ts all --env=test --no-compile without the compiled video
npx tsx demo/run.ts all --env=test --compile-only compiled video built from the existing videos
npx tsx demo/run.ts all --env=test --reburn       subtitles burned in again (demo/tmp), without re-recording
npx tsx demo/run.ts parcours --env=test           journey of a voice request (P01 to P05) + compiled video
```

`all` and `parcours` are used alone. The S and P series cannot be mixed in a single
run (`S01 P01` is refused): the P series needs assisted voice creation, the S series
disables it.

The environment must be declared explicitly as "dev" or "test" (`--env=…` or `NODE_ENV`):
otherwise the demo refuses to run. It also refuses any database that is not local.

## Outputs

- `demo/videos/S01-menu-lateral.mp4` … `S13-vue-surveillant.mp4`;
- `demo/videos/demo-superadmin-complete.mp4`: all the videos, with a title screen before
  each one (mobile views centered in 1280×720);
- `demo/tmp/`: raw videos (.webm), subtitles (.srt), title screens.

## Data

Everything is fictional and disposable:

- embedded PostgreSQL database created for the demo (port 55435), migrations applied, **reset
  and re-seeded before each scenario** (each scenario can be replayed on its own), destroyed at
  the end;
- accounts from the demo seed (`superadmin`, `admin`, `enseignante`, `reprographie`,
  `surveillant`, `surveillant2`, `remplacant`, `nouveau`, `autre`), common demo password (`demo/lib/config.ts`);
- data specific to each scenario created through the API (the application's real rules) in
  `prepare`; only elapsed time (delays) is simulated in the disposable database;
- the API keeps the settings in memory: after each reset, the default settings are
  rewritten through the API to empty this cache.

The seed contains categories marked "démo" (demo) ("Intervention technique (démo circuit B)", i.e. technical intervention (demo workflow B),
"Petits travaux (démo photo)", i.e. small jobs (demo photo)): they are used as they are, never deleted.

Ports: API 3200, frontend 5175 (neither those of the development application, nor those of the e2e tests).

Assignments (S07, S11, S12): slots of the school's current day (Europe/Paris), like the e2e tests. Run
the demo before 10 pm, school time: later, the one-hour slots spill over into the next day.

## Scenarios

| Id | File | Viewport | Note |
| --- | --- | --- | --- |
| S01 | `scenarios/S01-menu-lateral.ts` | desktop | Profile block: link to "Mon profil" (My profile) (spec 005). |
| S02 | `scenarios/S02-notifications.ts` | desktop | Simulated delays; alerts raised by the scheduled tasks. |
| S03 | `scenarios/S03-mes-demandes.ts` | desktop | "Reçues" (Received) shows only the requests assigned to the super administrator. |
| S04 | `scenarios/S04-nouvelle-demande.ts` | desktop | "Surveillance" (Supervision) prepared (through the administration). |
| S05 | `scenarios/S05-comptes.ts` | desktop | — |
| S06 | `scenarios/S06-categories.ts` | desktop | — |
| S07 | `scenarios/S07-groupes-classes.ts` | desktop | An employee added to the Surveillants group; assignment in the new class. |
| S08 | `scenarios/S08-reglages.ts` | desktop | Alert threshold and acceptance deadline; effect visible within 30 s. |
| S09 | `scenarios/S09-journal-audit.ts` | desktop | Administrative actions on requests are logged; accept, start, finish: history only. |
| S10 | `scenarios/S10-tableau-de-bord.ts` | desktop | — |
| S11 | `scenarios/S11-suivi-gardes.ts` | desktop | Teacher report "En attente" (Pending) (slot of the day). |
| S12 | `scenarios/S12-affectation-surveillants.ts` | desktop | Supervisor already assigned: cannot be proposed; replacement by reassignment. |
| S13 | `scenarios/S13-vue-surveillant.ts` | mobile 390×844 | — |

Features missing from the application (inventory: `docs/superadmin-fonctionnalites.md`):
editing and deleting a duty.

## Journey of a voice request (P series)

`npx tsx demo/run.ts parcours --env=test` produces `demo/videos/P01-…` to `P05-…` and
`demo/videos/demo-parcours-demande-vocale.mp4`. The video opens on assisted voice creation:

- the request is spoken by a French synthetic voice (Windows, `System.Speech`), generated
  in `demo/tmp/voix-demande.wav` (text: `VOICE_SENTENCE`, `lib/config.ts`) and regenerated
  only when that text changes; it is played through Chromium's simulated microphone;
- if the Whisper server from `backend/.env` (`ASSIST_WHISPER_URL`) responds, the message is
  **actually transcribed** by Whisper and the suggestions come from the rules engine; otherwise,
  fall back to the local demo providers, and the subtitle says so;
- the wait for the transcription is shown sped up (×8), as indicated by the subtitle;
- `DEMO_API_LOG=<file>` writes the demo API's log (transcription time, suggestions).

| Id | File | Content |
| --- | --- | --- |
| P01 | `scenarios/P01-demande-vocale.ts` | Voice dictation: transcription, title, category (from an instruction), priority and recipient filled in automatically, "Voir pourquoi" (See why), history; then handling with a proof photo and closing. |
| P02 | `scenarios/P02-validation-administration.ts` | Written request. Validation by the head supervisor and choice of the employee, sent back for correction, resubmission, final validation. |
| P03 | `scenarios/P03-refus-annulation.ts` | Refusal with a reason by the administration, refusal with a reason by the employee, cancellation by the teacher. |
| P04 | `scenarios/P04-discussion.ts` | Written message, voice reply in the discussion, notifications. |
| P05 | `scenarios/P05-super-administrateur.ts` | Targeted alerts, dashboard, reassignment, audit log. |
