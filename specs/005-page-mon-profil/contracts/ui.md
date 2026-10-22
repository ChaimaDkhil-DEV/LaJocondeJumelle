# Contrat d'interface — 005 Page « Mon profil »

## Lien du bloc profil (FR-001)

- Emplacement : bas de la barre latérale (desktop) et bas du tiroir du menu (mobile) — même
  élément.
- Rôle : lien vers `/profil`. Nom accessible : « Mon profil : <nom>, <rôle> » (textes masqués
  visuellement « Mon profil : » et la virgule, autour du contenu visible : nom et rôle sont deux
  éléments en ligne qui seraient sinon lus d'un seul mot).
- Focus visible ; actif (style « page courante », `aria-current="page"`) quand `/profil` est
  affichée ; sur mobile, l'activer ferme le tiroir.

## Page `/profil` (FR-002 à FR-006, FR-011, FR-012)

- Gabarit de l'application (menu présent) ; inatteignable tant que le changement de mot de passe
  est imposé (redirection existante vers `/mot-de-passe`).
- Titre de page (`h1`) : « Mon profil ».
- Informations, en liste de termes et définitions, lecture seule :

  | Terme | Valeur |
  |-------|--------|
  | Nom | nom affiché |
  | Identifiant de connexion | identifiant |
  | Fonction | fonction, ou « Non renseignée » |
  | Rôle | « Employé », « Admin » ou « Super administrateur » |
  | Groupes d'affectation | « Surveillants », « Enseignants », les deux, ou « Aucun » |

- Mention : « Pour modifier ces informations, adressez-vous à l'administration. »
- Action : lien-bouton « Changer mon mot de passe » → `/mot-de-passe`.
- Confirmation après un changement volontaire : message de succès en zone de statut
  (`role="status"`) : « Mot de passe modifié. Vos autres sessions ont été fermées. »
- États : chargement et erreur de chargement assurés par `RequireAuth` (« Chargement de votre espace », message et « Réessayer ») avant le rendu de la page, comme pour toutes les pages protégées ; la page n'a pas d'état propre.
- 320 px : aucune ligne ne déborde (identifiant long : retour à la ligne).

## Page `/mot-de-passe` — deux modes (FR-007 à FR-010)

Le mode est déterminé par `mustChangePassword` du compte (état serveur), jamais par l'URL.

| | Imposé (`true`) — inchangé | Volontaire (`false`) |
|---|---|---|
| Titre | « Changer votre mot de passe » | idem |
| Texte d'explication | « Pour sécuriser votre compte, choisissez… » | aucun |
| Champs, règles, messages d'erreur | actuels | actuels |
| « Annuler » | absent | présent → `/profil`, rien n'est changé |
| Après succès | `/` (accueil) | `/profil` avec la confirmation ci-dessus |
