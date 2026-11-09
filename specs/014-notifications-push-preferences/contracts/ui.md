# Contrat d'interface : Notifications push et préférences

Tous les textes passent par `t()` avec leur entrée dans le dictionnaire anglais. Les composants, états
(chargement, vide, erreur, succès) et messages suivent ceux de l'application (`SectionCard`, `Alert`,
`LoadingState`). Largeur minimale 320 px, sans défilement horizontal, en portrait et en paysage ; utilisable au
clavier et au toucher (cibles d'au moins 44 px) ; WCAG 2.2 AA.

## « Mon profil » → section « Notifications »

Nouvelle `SectionCard` sous les sections existantes, titrée « Notifications » (titre de niveau 2).

### 1. Cet appareil

Un bloc d'état (`role="status"`, annoncé quand il change) avec une action selon l'état (research R12) :

| État | Message | Action |
|---|---|---|
| `disabled` | « Les notifications push ne sont pas activées par l'établissement. » | aucune |
| `unsupported` | « Cet appareil ou ce navigateur ne permet pas les notifications push. Les notifications restent visibles dans l'application. » | aucune |
| `ios-install` | « Sur iPhone et iPad (iOS 16.4 ou plus récent), ajoutez d'abord l'application à l'écran d'accueil : touchez « Partager », puis « Sur l'écran d'accueil ». Ouvrez ensuite l'application depuis l'écran d'accueil. » (liste numérotée, en texte) | aucune |
| `denied` | « Vous avez refusé les notifications pour ce site. Réactivez-les dans les réglages du navigateur ou du téléphone. » | aucune |
| `reactivate` | « Les notifications de cet appareil doivent être réactivées. » | bouton « Réactiver » |
| `inactive` | « Les notifications push sont désactivées sur cet appareil. » | bouton « Activer les notifications sur cet appareil » |
| `active` | « Les notifications push sont actives sur cet appareil. » | bouton secondaire « Désactiver sur cet appareil » |

- La demande d'autorisation du navigateur n'est déclenchée **que** par le clic sur « Activer… » ou « Réactiver »
  (FR-001), jamais à l'affichage.
- Pendant l'activation : bouton désactivé avec indicateur ; en cas d'échec, `Alert` d'erreur avec la cause et
  l'action possible (autorisation refusée, limite de 10 appareils, push désactivé, erreur réseau : « Réessayez »).
- Note permanente sous le bloc : « Sur un appareil partagé, déconnectez-vous en partant : sinon vos notifications
  continuent d'y arriver. »

### 2. Catégories

Quatre interrupteurs (`Switch` avec libellé visible et description) :

| Libellé | Description |
|---|---|
| Urgent | « Demandes de travail urgentes. » |
| Couverture | « Affectations, classes vides, retards et absences signalés, relèves. » |
| Garde non pourvue | « Gardes restées sans surveillant et alertes non traitées. » |
| Pointage | « Arrivée de l'enseignant sur votre garde et anomalies de pointage. » |

- Désactiver une catégorie depuis l'ouverture de « Mon profil » : **défiler/atteindre la section, toucher
  l'interrupteur** = 2 actions (SC-004 : 3 au plus). Enregistrement immédiat (sans bouton « Enregistrer »),
  confirmation discrète annoncée (« Préférence enregistrée. »), retour à l'état précédent avec message en cas
  d'erreur.
- Visibles et modifiables même si l'appareil n'est pas abonné ou si le push est désactivé (elles valent pour tous
  les appareils), avec la mention « Ces choix s'appliquent à tous vos appareils abonnés. »
- Mention de la plage : « Envoi du lundi au vendredi, de 07:30 à 18:30 (heure de l'école). En dehors, les
  notifications restent dans l'application. » (valeurs réelles des réglages).

### 3. Son des urgences

Interrupteur « Signal sonore pour les urgences », relié au compte (NC-6). Le bouton existant de la cloche
(`Volume2`/`VolumeX`) reste et modifie la même préférence.

### 4. Mes appareils

Liste (`<ul>`) des appareils abonnés : libellé, « Activé le … », « Dernière utilisation le … », badge « Cet
appareil » pour l'appareil courant. Bouton « Retirer » pour chacun, avec nom accessible explicite (« Retirer
iPhone · Safari ») et confirmation. État vide : « Aucun appareil abonné. »

## « Réglages » (super administrateur) → bloc « Notifications push »

Dans la page de réglages existante, nouveau groupe « Plage d'envoi des notifications push » :

- Jours : sept cases à cocher (lundi à dimanche), groupe `fieldset` avec `legend`.
- Heure de début, heure de fin : champs heure avec libellés.
- Aide : « Heure de l'école. En dehors de cette plage, aucune notification push n'est envoyée ni différée ; les
  notifications restent dans l'application. Les signalements de retard arrivent souvent avant 07:30. »
- Enregistrement avec le bouton existant de la page ; erreurs de validation sur le champ concerné.
- Mention en lecture seule de l'état : « Notifications push : activées » ou « désactivées (clés non
  configurées) ».

## Ouverture depuis un push

Arrivée sur `/gardes/<id>?notification=<nid>` ou `/demandes/<id>?notification=<nid>` : la page charge comme
d'habitude ; la notification est marquée lue seulement après un chargement réussi, puis le paramètre est retiré
(`replace`). Aucun message particulier.

## Déconnexion

Le menu « Se déconnecter » existant, avant l'appel de déconnexion : désabonnement de l'appareil côté navigateur
et `DELETE /api/push/subscriptions/current` (sans bloquer la déconnexion en cas d'échec).

## Installation

`index.html` déclare le manifeste, la couleur de thème et l'icône pour l'écran d'accueil iPhone. Aucune invite
d'installation n'est affichée par l'application en dehors de l'état `ios-install`.
