## Résumé

<!-- Ce que change cette demande de fusion, et pourquoi. -->

## Vérification avant fusion

Procédure manuelle : `docs/procedure-fusion.md`. GitHub ne bloque
pas la fusion ; une case non cochée interdit de fusionner.

- [ ] **1. CI** : « Contrôles qualité » réussi sur le dernier commit (`gh pr checks <n°>`) ; ni
      absent, ni en cours, ni en échec, ni annulé
- [ ] **2. Tests requis** : toutes les étapes de la CI ont tourné ; pour une livraison,
      `npm run test:e2e` lancé à la main et consigné dans `docs/validation/`
- [ ] **3. Aucun échec non résolu** : aucun test désactivé ou ignoré sans raison consignée ;
      branche à jour avec `master` ; aucune discussion de revue ouverte
- [ ] **4. Diff relu** (`gh pr diff <n°>`) : tests écrits d'abord et verts, attendus existants
      inchangés sauf exception documentée, aucun secret, aucun fichier inattendu
