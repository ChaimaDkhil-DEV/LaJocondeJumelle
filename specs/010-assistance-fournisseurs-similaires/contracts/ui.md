# UI Contract: demandes similaires (010)

## Panneau « Propositions automatiques » — section « Demandes similaires »

- Affichée après « Consignes utilisées » quand `similar` n'est pas vide ; absente sinon.
- Titre « Demandes similaires », phrase « Vérifiez qu'il ne s'agit pas d'un doublon. ».
- Liste nommée « Demandes similaires » ; chaque élément :
  - lien « D-2026-000042 · Photocopieuse du 1er étage en panne » vers `/demandes/:id`,
    `target="_blank"`, `rel="noopener"`, mention masquée « (nouvel onglet) » ;
  - ligne secondaire : catégorie · priorité (libellé) · statut (libellé), texte simple.
- Aucune action ne modifie le formulaire ; le jeton `assistToken` est inchangé.

## Transcription

Un nouvel enregistrement (ou sa suppression) masque la transcription précédente ; le clic suivant
sur « Proposer… » demande une nouvelle transcription.
