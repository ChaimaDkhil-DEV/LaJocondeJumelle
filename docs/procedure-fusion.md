# Vérification avant fusion vers `master`

> **Procédure manuelle : elle ne constitue pas une protection technique.** GitHub n'empêche pas
> une fusion dont les tests échouent, ni un envoi direct sur `master`.

Le dépôt GitHub est privé, sur l'offre gratuite : les règles de protection de branche n'y sont
pas disponibles (l'API renvoie `403 Upgrade to GitHub Pro or make this repository public`,
constaté le 15 octobre 2026). La règle de la constitution, « Aucune modification ne peut être
fusionnée si la suite de tests échoue », repose donc sur la personne qui fusionne
(décision D10, `specs/003-corrections-audit-technique/spec.md`).

## Règles

- Toute modification de `master` passe par une demande de fusion. Pas d'envoi direct sur
  `master`.
- Juste avant de fusionner, la personne qui fusionne vérifie les quatre contrôles ci-dessous
  sur le **dernier commit** de la demande, et les coche dans sa description (modèle
  `.github/pull_request_template.md`).
- Un contrôle non coché ou non satisfait interdit la fusion.

## Les quatre contrôles

| #   | Contrôle               | Comment le vérifier                                                                                                                                                                                                                                            | Fusion interdite si                                                                       |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Résultat de la CI      | `gh pr checks <n°>` ou onglet « Checks » : le job « Contrôles qualité » a tourné sur le dernier commit                                                                                                                                                         | absent, en cours, en échec ou annulé                                                      |
| 2   | Tests requis           | le job a exécuté toutes ses étapes : lint, types backend et frontend, tests unitaires, d'intégration et frontend, `npm audit --audit-level=high`. Pour une livraison, en plus : `npm run test:e2e` lancé à la main et consigné dans `docs/validation/`         | une étape manque ou a été sautée ; compte rendu de bout en bout absent pour une livraison |
| 3   | Aucun échec non résolu | aucun test désactivé ou ignoré (`.skip`, `.only`, `--testPathIgnorePatterns`) sans raison consignée dans `docs/validation/` ; branche à jour avec `master` (sinon y fusionner `master` et attendre une nouvelle CI verte) ; aucune discussion de revue ouverte | une de ces conditions n'est pas remplie                                                   |
| 4   | Examen du diff         | relecture complète de `gh pr diff <n°>` (onglet « Files changed ») selon la revue de code de la constitution : tests écrits d'abord et verts, attendus des tests existants inchangés sauf exception documentée, aucun secret, aucun fichier inattendu          | un point de la revue n'est pas satisfait                                                  |

## Fusion faite malgré un échec

La corriger aussitôt par une nouvelle demande de fusion (correctif ou `git revert`), et le
consigner dans `docs/validation/`.

## Si la protection de branche devient disponible

Si le dépôt passe à une offre qui le permet, créer sur `master` (GitHub → Settings → Branches →
Branch protection rules) : « Require a pull request before merging », « Require status checks
to pass before merging » avec « Contrôles qualité », « Require branches to be up to date before
merging ». Les contrôles 2 à 4 restent à vérifier à la main.
