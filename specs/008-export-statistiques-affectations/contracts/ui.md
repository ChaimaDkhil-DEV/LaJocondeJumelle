# Contrat d'interface : export des statistiques

## Page « Statistiques des affectations » (`/gardes/statistiques`)

- Nouveau bouton-lien **« Exporter en CSV »** (icône de téléchargement, `aria-hidden`), placé au-dessus
  des totaux, aligné à droite sur desktop, pleine largeur possible à 320 px sans défilement
  horizontal.
- Adresse : `/api/coverage/stats/export.csv?` + exactement les paramètres de la requête affichée
  (`from`, `to`, `groupBy`, et `period` si « Période »), attribut `download`.
- Affiché seulement quand les statistiques des filtres affichés sont chargées :
  - absent tant qu'une date est incomplète (la requête n'est pas lancée) ;
  - absent pendant un recalcul (les anciennes valeurs restent affichées, mais pas exportables) ;
  - absent après une erreur (`INVALID_RANGE` ou autre) ;
  - présent pour une période vide (le fichier contient alors des totaux à zéro).
- Accessibilité : nom accessible « Exporter en CSV », atteignable et activable au clavier, focus
  visible (composants existants) ; audit axe sans violation à 320 px et sur desktop.
- Commentaire d'en-tête de `CoverageStatsPage` (« aucun export dans ce lot ») mis à jour.

## Journal d'audit (Administrateur › Journal d'audit)

- Filtre « Action » : nouvelle entrée **« Export des statistiques des affectations »**.
- Ligne d'une entrée : auteur, date et heure, libellé ci-dessus, détails
  `from`, `to`, `groupBy`, `period` (affichage générique existant des détails).
