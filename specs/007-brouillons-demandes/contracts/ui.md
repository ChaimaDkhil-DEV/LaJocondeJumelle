# Contrat d'interface — 007 Brouillons de demande de travail

## « Nouvelle demande » (`/demandes/nouvelle`)

- Bouton secondaire **« Enregistrer en brouillon »** à côté de « Envoyer la demande », seulement si
  le réglage public `draftsEnabled` est vrai.
- Validation pour le brouillon : catégorie (« Choisissez une catégorie. ») et titre (« Saisissez un
  titre. ») seulement ; priorité « Normale » si non choisie.
- Succès : toast « Brouillon enregistré. », ouverture de `/demandes/:id/brouillon`.

## « Mes demandes » (`/`)

- Onglet **« Brouillons »** (`?onglet=brouillons`), après « Envoyées », affiché seulement si
  l'utilisateur a au moins un brouillon ; liste du périmètre `drafts`.
- Chaque brouillon : badge « Brouillon », titre, catégorie, date ; lien vers
  `/demandes/:id/brouillon`.
- « Envoyées » : plus aucun brouillon.

## Page brouillon (`/demandes/:id/brouillon`)

- Titre (`h1`) : « Brouillon de demande » ; retour « Retour aux demandes ».
- Formulaire de « Nouvelle demande » pré-rempli (catégorie, destinataire, priorité, titre,
  description).
- Message vocal existant : lecteur (`VoicePlayer`) avec « Remplacer le message vocal » et
  « Supprimer le message vocal » ; sans vocal : enregistreur comme à la création.
- Actions : **« Envoyer la demande »** (principale), **« Enregistrer le brouillon »**,
  **« Supprimer le brouillon »** (dialogue « Supprimer ce brouillon ? », confirmation « Supprimer »).
- Succès : envoyer → toast « Votre demande a été envoyée. » et détail `/demandes/:id` ; enregistrer
  → toast « Brouillon enregistré. » ; supprimer → toast « Brouillon supprimé. » et « Mes demandes ».
- Brouillon déjà envoyé ou supprimé ailleurs : message d'erreur puis retour à « Mes demandes ».
- Lien direct `/demandes/:id` vers un brouillon : redirection vers cette page.
- 320 px sans défilement horizontal ; actions empilées sur mobile.
