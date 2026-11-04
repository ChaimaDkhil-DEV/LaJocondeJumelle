# UI Contract: AI assistance (foundation)

## « Nouvelle demande » (New request) — mockup "Option A · Voix d'abord" (Voice first) (revision)

Discreet header: « Retour aux demandes » (Back to requests) and breadcrumb on a small line, title
« Nouvelle demande », sub-sentence « Parlez, on remplit le reste. » (Speak, we fill in the rest.).
A single centered white card (640 px at most, rounded corners, light shadow); in order:

1. **Voice message** (dominant block, light indigo background): large round button (64 px) on the
   left — « Enregistrer un message vocal » (Record a voice message), then « Arrêter
   l'enregistrement » (Stop recording; red) during recording, then « Refaire l'enregistrement »
   (Record again); in the center « Appuyez pour enregistrer » (Press to record) and
   « Durée maximale 3:00 » (Maximum duration 3:00), then « Enregistrement · 0:05 / 3:00 »
   (Recording) with an animated waveform (still if animations are reduced), then
   « Message vocal · 0:12 » (Voice message) with the voice message's waveform
   (playback progress, keyboard slider « Position dans le message vocal ») and the link
   « Supprimer » (« Supprimer le message vocal »; Delete the voice message); on the right, round
   button « Lire / Mettre en pause le message vocal » (Play / Pause the voice message). The
   announcements (« Enregistrement terminé… »; Recording finished…) go through an invisible
   `status` region.
2. **A single sentence**, small and gray: « Champs préremplis d'après votre message :
   vérifiez-les. » (Fields prefilled from your message: check them.; only when suggestions exist),
   with the small links « Voir pourquoi » (See why; collapsed justification) and « Relancer
   l'analyse » (Rerun the analysis). During analysis: « Transcription du message vocal… »,
   « Recherche de propositions… » (Searching for suggestions…); on error: server message
   + « Votre message vocal est conservé : remplissez les champs vous-même ou relancez
   l'analyse. » (Your voice message is kept: fill in the fields yourself or rerun the analysis.).
   Description only, without a voice message: link « Proposer une catégorie et une priorité ».
3. **Title** (full width).
4. **Category** and **Recipient** side by side (stacked on mobile).
5. **Priority**: segmented buttons Normale / Moyenne / Haute / Urgente (Normal / Medium / High /
   Urgent), 44 px high (native radios), the chosen option with indigo border and background.
6. Two collapsible links on one line: « + Ajouter une description (facultatif) » (Add a
   description (optional); field « Description (facultative) », open by default if it already has
   content) and « N demande(s) similaire(s) › » (N similar request(s); one line per request:
   reference · title, status; new tab).
7. **Envoyer la demande** (Submit the request; main button, full width, fixed at the bottom of the
   screen on mobile; scrolling stops above it); « Enregistrer en brouillon » (Save as draft) as a
   discreet text button.

- **Suggested values** (category, recipient, priority, title): they directly prefill the empty
  fields or those already suggested; a value typed or chosen by the user is never replaced.
  Badge « Suggéré » (Suggested; decorative, `aria-hidden`) above each prefilled field, removed as
  soon as the user modifies it.
- **Not displayed**: separate « Propositions automatiques » block, transcription, « Aucune
  consigne ne correspond… » (No guideline matches…), information to specify, guidelines used,
  per-field mentions.
- **Recipient « À confirmer »** (To be confirmed; after an analysis, workflow A, empty recipient):
  dark orange outline, very light amber background and text « À confirmer » in the field; no
  warning block. Workflow B: sober mention « Cette demande sera d'abord validée par un admin… »
  (This request will first be validated by an admin…).
- **Recipient**: suggested by the server from the assignment rules only; the
  dropdown only displays and sends an allowed recipient.
- **Category changed by hand** after an analysis (workflow A): new analysis with this
  category (`categoryId`). **New voice message or voice message deleted**: suggestions, token and
  suggested values of the old voice message removed; manual choices stay.
- A new suggestion request replaces the previous one; a late response is ignored.
  The last `token` is sent with the request (`assistToken`), suggested recipient included.
- Accessibility: labels linked to fields, `aria-label` on icon buttons, `aria-expanded` on
  collapsible links, visible focus, touch targets ≥ 44 px, contrast ≥ 4.5:1.

## Request history

`ASSIST_SUGGESTED` entry (`Sparkles` icon): « Propositions automatiques : catégorie
« X » (retenue : « Y »), priorité Haute (retenue), titre proposé (modifié) » (Automatic
suggestions: category "X" (kept: "Y"), priority High (kept), suggested title (modified)); then
« Consignes : A, B » (Guidelines: A, B).

## Administrator area — « Consignes » tab (`/admin/consignes`)

- Page title « Consignes » (Guidelines); description « Règles de classement, critères de priorité
  et procédures utilisés pour les propositions automatiques. » (Classification rules, priority
  criteria and procedures used for automatic suggestions.).
- Button « Nouvelle consigne »; table: Titre, Portée (« Générale » or the category name),
  État (badge « Active » / « Inactive »), Modifiée le; actions « Modifier », « Activer » /
  « Désactiver », « Supprimer » (confirmation).
- Dialog: « Titre » (120), « Texte » (multiline, 4,000, counter), « Portée » (list:
  Générale + work request categories), checkbox « Active ». Help under « Texte »: « Vous
  pouvez indiquer une priorité sous la forme « Priorité : Haute ». » (You can specify a priority
  in the form "Priorité : Haute".).
- States: loading, empty list (« Aucune consigne. »), error with « Réessayer » (Retry).
- Accessibility: labels, keyboard, visible focus, 320 px without horizontal scrolling of the page.

## Audit log

Label of `GUIDELINE_CHANGED`: « Consigne créée / modifiée / supprimée » (Guideline created /
modified / deleted) + title.
