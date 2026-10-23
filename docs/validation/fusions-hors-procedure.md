# Fusions faites hors procédure

Registre demandé par `docs/procedure-fusion.md` (« Fusion faite malgré un échec ») : chaque
fusion vers `master` faite sans que les quatre contrôles soient satisfaits, avec sa correction.

## 23/10/2026 — demandes #28 et #29

| Demande | Contenu | Fusionnée à (UTC) | Contrôle non satisfait au moment de la fusion |
|---------|---------|-------------------|-----------------------------------------------|
| #28 (`docs-007-cocher-t021`) | `specs/007-brouillons-demandes/tasks.md` : T021 cochée, une ligne | 10:31:48 | **1. CI** : run `pull_request` 39937940094 en échec (deux tentatives) ; le run `push` 39937933975 sur le même commit `e874877` était vert |
| #29 (`ci-timeout-ffmpeg-10min`) | `.github/workflows/ci.yml` : plafond de l'étape ffmpeg passé de 5 à 10 min | 10:32:03 | **1. CI** : les deux runs sur `0d9392c` étaient encore en cours (39939434856 vert à 10:32:09, 39939429091 vert à 10:33:34) |

Cases de la procédure non cochées dans la description des deux demandes.

### Cause de l'échec sur #28

L'étape « Installer ffmpeg (conversion des vocaux) » a dépassé son plafond de 5 minutes aux
deux tentatives du run 39937940094 (miroir apt lent : environ 3 minutes pour un seul paquet).
Toutes les étapes suivantes ont été sautées ; aucun lint, typecheck ni test n'a échoué. La
demande #29 relève ce plafond à 10 minutes.

### Constat après coup

- #28 : modification de documentation seule, sans code ; le run `push` sur le même commit a
  exécuté toutes les étapes avec succès.
- #29 : les deux runs ont fini verts, toutes étapes exécutées.
- `master` vert après les deux fusions : run 39939755186 sur `3e569e3` (fusion de #28) et run
  39939785006 sur `59a9b85` (fusion de #29).

Aucun correctif ni `git revert` nécessaire.

### Rappel

Attendre la fin de **tous** les runs « Contrôles qualité » du dernier commit (`gh pr checks <n°>`,
ni « pending » ni « fail ») et cocher les quatre cases avant de fusionner. Un run en échec pour
une cause d'infrastructure se relance (`gh run rerun <id> --failed`) ; il ne s'ignore pas.
