# UI Contract: Assistance IA (socle)

## « Nouvelle demande » — maquette « Option A · Voix d'abord » (révision)

En-tête discret : « Retour aux demandes » et fil d'Ariane sur une petite ligne, titre « Nouvelle
demande », sous-phrase « Parlez, on remplit le reste. ». Une seule carte blanche centrée (640 px au
plus, coins arrondis, ombre légère) ; dans l'ordre :

1. **Message vocal** (bloc dominant, fond indigo clair) : grand bouton rond (64 px) à gauche —
   « Enregistrer un message vocal », puis « Arrêter l'enregistrement » (rouge) pendant
   l'enregistrement, puis « Refaire l'enregistrement » ; au centre « Appuyez pour enregistrer » et
   « Durée maximale 3:00 », puis « Enregistrement · 0:05 / 3:00 » avec une forme d'onde animée
   (immobile si les animations sont réduites), puis « Message vocal · 0:12 » avec la forme d'onde
   du vocal (progression de lecture, curseur clavier « Position dans le message vocal ») et le lien
   « Supprimer » (« Supprimer le message vocal ») ; à droite, bouton rond « Lire / Mettre en pause
   le message vocal ». Les annonces (« Enregistrement terminé… ») passent par une région `status`
   invisible.
2. **Une seule phrase**, petite et grise : « Champs préremplis d'après votre message :
   vérifiez-les. » (seulement quand des suggestions existent), avec les petits liens « Voir
   pourquoi » (justification repliée) et « Relancer l'analyse ». Pendant l'analyse :
   « Transcription du message vocal… », « Recherche de propositions… » ; en cas d'erreur : message
   du serveur + « Votre message vocal est conservé : remplissez les champs vous-même ou relancez
   l'analyse. ». Description seule, sans vocal : lien « Proposer une catégorie et une priorité ».
3. **Titre** (pleine largeur).
4. **Catégorie** et **Destinataire** côte à côte (empilés sur mobile).
5. **Priorité** : boutons segmentés Normale / Moyenne / Haute / Urgente, 44 px de haut (radios
   natives), l'option choisie avec bordure et fond indigo.
6. Deux liens repliables sur une ligne : « + Ajouter une description (facultatif) » (champ
   « Description (facultative) », ouvert d'office s'il a déjà un contenu) et « N demande(s)
   similaire(s) › » (une ligne par demande : référence · titre, statut ; nouvel onglet).
7. **Envoyer la demande** (bouton principal pleine largeur, fixé en bas de l'écran sur mobile ;
   le défilement s'arrête au-dessus) ; « Enregistrer en brouillon » en bouton texte discret.

- **Valeurs suggérées** (catégorie, destinataire, priorité, titre) : elles préremplissent
  directement les champs vides ou déjà proposés ; une valeur saisie ou choisie par l'utilisateur
  n'est jamais remplacée. Badge « Suggéré » (décoratif, `aria-hidden`) au-dessus de chaque champ
  prérempli, retiré dès que l'utilisateur le modifie.
- **Non affichés** : bloc « Propositions automatiques » séparé, transcription, « Aucune consigne ne
  correspond… », informations à préciser, consignes utilisées, mentions par champ.
- **Destinataire « À confirmer »** (après une analyse, circuit A, destinataire vide) : contour
  orange foncé, fond ambre très clair et texte « À confirmer » dans le champ ; aucun bloc
  d'avertissement. Circuit B : mention sobre « Cette demande sera d'abord validée par un admin… ».
- **Destinataire** : proposé par le serveur d'après les règles d'affectation seulement ; la liste
  déroulante n'affiche et n'envoie qu'un destinataire autorisé.
- **Catégorie changée à la main** après une analyse (circuit A) : nouvelle analyse avec cette
  catégorie (`categoryId`). **Nouveau vocal ou vocal supprimé** : propositions, jeton et valeurs
  proposées de l'ancien vocal retirés ; les choix manuels restent.
- Une nouvelle demande de propositions remplace la précédente ; une réponse tardive est ignorée.
  Le dernier `token` est envoyé avec la demande (`assistToken`), destinataire proposé compris.
- Accessibilité : libellés liés aux champs, `aria-label` des boutons-icônes, `aria-expanded` des
  liens repliables, focus visible, cibles tactiles ≥ 44 px, contraste ≥ 4,5:1.

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
