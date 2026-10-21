# Vidéos de démonstration — super administrateur

Une vidéo par scénario, enregistrée avec Playwright (`recordVideo`), sous-titres français incrustés
par ffmpeg (texte blanc sur fond semi-transparent), curseur visible, pauses de 1 à 2 s. Pas de voix
off. Les vidéos produites ne sont pas versionnées (voir `.gitignore`) ; la démo ne modifie pas le
code de l'application.

## Lancer

Depuis la racine du dépôt, dépendances installées, ffmpeg disponible (sur le PATH, ou chemins dans
`FFMPEG_PATH` et `FFPROBE_PATH`, mêmes valeurs que dans `backend/.env`) :

```text
npx tsx demo/run.ts all --env=test              tous les scénarios + vidéo compilée
npx tsx demo/run.ts S12 --env=test              un seul scénario
npx tsx demo/run.ts S01 S05 --env=test          plusieurs scénarios
npx tsx demo/run.ts all --env=test --no-compile sans la vidéo compilée
npx tsx demo/run.ts all --env=test --compile-only vidéo compilée à partir des vidéos existantes
npx tsx demo/run.ts all --env=test --reburn       sous-titres réincrustés (demo/tmp), sans réenregistrer
```

L'environnement doit être déclaré explicitement « dev » ou « test » (`--env=…` ou `NODE_ENV`) :
sinon la démo refuse de s'exécuter. Elle refuse aussi toute base qui n'est pas locale.

## Sorties

- `demo/videos/S01-menu-lateral.mp4` … `S13-vue-surveillant.mp4` ;
- `demo/videos/demo-superadmin-complete.mp4` : toutes les vidéos, avec un écran-titre avant
  chacune (vues mobiles centrées en 1280×720) ;
- `demo/tmp/` : vidéos brutes (.webm), sous-titres (.srt), écrans-titres.

## Données

Tout est fictif et jetable :

- base PostgreSQL embarquée créée pour la démo (port 55435), migrations appliquées, **remise à
  zéro et réensemencée avant chaque scénario** (chaque scénario est rejouable seul), détruite à
  la fin ;
- comptes du seed de démonstration (`superadmin`, `admin`, `enseignante`, `reprographie`,
  `surveillant`, `surveillant2`, `remplacant`, `nouveau`, `autre`), mot de passe de démo commun (`demo/lib/config.ts`) ;
- données propres à chaque scénario créées par l'API (vraies règles de l'application) dans
  `prepare` ; seul le temps écoulé (retards) est simulé dans la base jetable ;
- l'API garde les réglages en mémoire : après chaque remise à zéro, les réglages par défaut sont
  réécrits par l'API pour vider ce cache.

Le seed contient des catégories marquées « démo » (« Intervention technique (démo circuit B) »,
« Petits travaux (démo photo) ») : elles sont utilisées telles quelles, jamais supprimées.

Ports : API 3200, frontend 5175 (ni ceux de l'application de développement, ni ceux des e2e).

Affectations (S07, S11, S12) : créneaux du jour de l'école (Europe/Paris), comme les e2e. Lancer
la démo avant 22 h, heure de l'école : plus tard, les créneaux d'une heure débordent sur le lendemain.

## Scénarios

| Id | Fichier | Viewport | Remarque |
| --- | --- | --- | --- |
| S01 | `scenarios/S01-menu-lateral.ts` | desktop | Pas de page de profil (montré tel quel). |
| S02 | `scenarios/S02-notifications.ts` | desktop | Retards simulés ; alertes posées par les tâches planifiées. |
| S03 | `scenarios/S03-mes-demandes.ts` | desktop | « Reçues » ne montre que les demandes affectées au super administrateur. |
| S04 | `scenarios/S04-nouvelle-demande.ts` | desktop | « Surveillance » préparée (via l'administration). |
| S05 | `scenarios/S05-comptes.ts` | desktop | — |
| S06 | `scenarios/S06-categories.ts` | desktop | — |
| S07 | `scenarios/S07-groupes-classes.ts` | desktop | Un employé ajouté au groupe Surveillants ; affectation dans la nouvelle classe. |
| S08 | `scenarios/S08-reglages.ts` | desktop | Seuil d'alerte et délai de prise en charge ; effet visible en 30 s. |
| S09 | `scenarios/S09-journal-audit.ts` | desktop | Actions administratives sur les demandes journalisées ; accepter, commencer, terminer : historique seul. |
| S10 | `scenarios/S10-tableau-de-bord.ts` | desktop | — |
| S11 | `scenarios/S11-suivi-gardes.ts` | desktop | Signalement d'enseignant « En attente » (créneau du jour). |
| S12 | `scenarios/S12-affectation-surveillants.ts` | desktop | Surveillant déjà affecté : non proposable ; remplacement par réassignation. |
| S13 | `scenarios/S13-vue-surveillant.ts` | mobile 390×844 | — |

Fonctionnalités absentes de l'application (inventaire : `docs/superadmin-fonctionnalites.md`) :
page de profil, modification et suppression d'une garde.
