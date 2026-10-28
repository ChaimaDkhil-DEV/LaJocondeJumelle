# UI Contract: Assistance IA (socle)

## « Nouvelle demande » — panneau « Propositions automatiques »

Sous les champs du formulaire, avant les boutons d'envoi.

- **Assistance désactivée** (`assistSuggestions: false`) : texte discret « Les propositions
  automatiques ne sont pas disponibles. » ; aucun bouton.
- **Hors ligne** : « Les propositions automatiques demandent une connexion. » ; aucun bouton.
- **Bouton** « Proposer une catégorie et une priorité » (secondaire, `outlined`) ; désactivé sans
  description ni vocal, avec l'aide « Écrivez une description ou enregistrez un vocal. ».
- **Au clic** :
  1. vocal présent, sans transcription encore obtenue, et transcription disponible : envoi de
     l'enregistrement ; le champ **« Transcription (à vérifier) »** (multiligne, 4 000 caractères)
     s'affiche avec le texte, modifiable, et l'action « Utiliser comme description »
     (confirmation « Remplacer la description actuelle ? » si elle n'est pas vide) ;
  2. propositions demandées avec `description + transcription`.
- **Chargement** : bouton en chargement, « Recherche de propositions… » annoncé.
- **Résultat** (région `aria-live="polite"`, focus inchangé) :
  - lignes « Titre », « Catégorie », « Priorité », chacune avec sa valeur et un bouton
    « Appliquer » (nom accessible « Appliquer le titre proposé », etc.), puis « Tout appliquer » ;
  - « Pourquoi : » + justification ; « À préciser : » + informations manquantes ;
  - « Consignes utilisées » : liste titre + extrait ; ou « Aucune consigne ne correspond à cette
    demande. » ;
  - aucune proposition fiable : « Aucune proposition fiable n'a pu être faite. Vous pouvez remplir
    la demande vous-même. ».
- **Erreurs** (`Alert` `warning`) : message du serveur (`ASSIST_UNAVAILABLE`, `ASSIST_RATE_LIMITED`,
  `TRANSCRIPTION_EMPTY`, erreurs audio) ; le formulaire n'est jamais modifié.
- Une nouvelle demande de propositions remplace la précédente ; une réponse tardive est ignorée.
- Le dernier `token` reçu est envoyé avec la demande (`assistToken`).

## Historique d'une demande

Entrée `ASSIST_SUGGESTED` (icône `Sparkles`) : « Propositions automatiques : catégorie
« X » (retenue : « Y »), priorité Haute (retenue), titre proposé (modifié) » ; puis « Consignes :
A, B ».

## Espace Administrateur — onglet « Consignes » (`/admin/consignes`)

- Titre de page « Consignes » ; description « Règles de classement, critères de priorité et
  procédures utilisés pour les propositions automatiques. ».
- Bouton « Nouvelle consigne » ; tableau : Titre, Portée (« Générale » ou nom de la catégorie),
  État (badge « Active » / « Inactive »), Modifiée le ; actions « Modifier », « Activer » /
  « Désactiver », « Supprimer » (confirmation).
- Dialogue : « Titre » (120), « Texte » (multiligne, 4 000, compteur), « Portée » (liste :
  Générale + catégories de demande de travail), case « Active ». Aide sous « Texte » : « Vous
  pouvez indiquer une priorité sous la forme « Priorité : Haute ». ».
- États : chargement, liste vide (« Aucune consigne. »), erreur avec « Réessayer ».
- Accessibilité : libellés, clavier, focus visible, 320 px sans défilement horizontal de la page.

## Journal d'audit

Libellé de `GUIDELINE_CHANGED` : « Consigne créée / modifiée / supprimée » + titre.
