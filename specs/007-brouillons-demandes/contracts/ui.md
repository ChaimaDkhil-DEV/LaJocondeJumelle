# UI Contract — 007 Brouillons de demande de travail (Work request drafts)

## « Nouvelle demande » (New request) (`/demandes/nouvelle`)

- Secondary button **« Enregistrer en brouillon »** (Save as draft) next to « Envoyer la demande » (Send the request), only if
  the public setting `draftsEnabled` is true.
- Validation for the draft: category (« Choisissez une catégorie. » (Choose a category.)) and title (« Saisissez un
  titre. » (Enter a title.)) only; priority « Normale » if not chosen.
- Success: toast « Brouillon enregistré. » (Draft saved.), opens `/demandes/:id/brouillon`.

## « Mes demandes » (My requests) (`/`)

- **« Brouillons »** (Drafts) tab (`?onglet=brouillons`), after « Envoyées » (Sent), shown only if
  the user has at least one draft; list for the `drafts` scope.
- Each draft: « Brouillon » badge, title, category, date; link to
  `/demandes/:id/brouillon`.
- « Envoyées »: no more drafts.

## Draft page (`/demandes/:id/brouillon`)

- Title (`h1`): « Brouillon de demande » (Request draft); back link « Retour aux demandes » (Back to requests).
- « Nouvelle demande » form pre-filled (category, recipient, priority, title,
  description).
- Existing voice message: player (`VoicePlayer`) with « Remplacer le message vocal » (Replace the voice message) and
  « Supprimer le message vocal » (Delete the voice message); without a voice message: recorder as at creation.
- Actions: **« Envoyer la demande »** (primary), **« Enregistrer le brouillon »** (Save the draft),
  **« Supprimer le brouillon »** (Delete the draft) (dialog « Supprimer ce brouillon ? » (Delete this draft?), confirmation « Supprimer » (Delete)).
- Success: send → toast « Votre demande a été envoyée. » (Your request has been sent.) and detail `/demandes/:id`; save
  → toast « Brouillon enregistré. »; delete → toast « Brouillon supprimé. » (Draft deleted.) and « Mes demandes ».
- Draft already sent or deleted elsewhere: error message then return to « Mes demandes ».
- Direct link `/demandes/:id` to a draft: redirect to this page.
- 320 px with no horizontal scrolling; actions stacked on mobile.
