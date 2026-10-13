# Vérification manuelle sur iPhone (T119)

**Statut : à réaliser.** Les tests automatisés WebKit utilisent une simulation de MediaRecorder
(le WebKit de Playwright n'a ni micro simulé ni décodeur AAC sous Windows) : seul un vrai iPhone
prouve l'enregistrement et la lecture des vocaux sur Safari iOS.

## Préparation

- iPhone sous **iOS 17 ou plus récent**, Safari.
- Application servie en **HTTPS** : instance de recette, ou poste de développement avec
  `docker compose -f deploy/docker-compose.dev.yml up caddy` puis `https://<ip-du-poste>:8443`
  (accepter le certificat interne sur l'iPhone).
- Comptes : `enseignante` (sur l'iPhone) et `reprographie` (sur un téléphone Android avec Chrome).
- Une demande contenant un vocal **enregistré sur Chrome Android**, créée au préalable.

## Contrôles

| # | Action sur l'iPhone | Résultat attendu | Résultat | Remarques |
|---|---------------------|------------------|----------|-----------|
| 1 | Nouvelle demande → « Enregistrer un message vocal » | Safari demande l'autorisation du micro ; l'enregistrement démarre avec un compteur | | |
| 2 | Parler 10 s puis « Arrêter l'enregistrement » | Durée affichée ; boutons Lire, Refaire, Supprimer | | |
| 3 | « Lire le message vocal » | Le son est audible et intelligible | | |
| 4 | « Refaire l'enregistrement », enregistrer 5 s | Seul le nouvel enregistrement est conservé (durée 0:05) | | |
| 5 | Choisir catégorie, destinataire, priorité, titre → « Envoyer la demande » | « Votre demande a été envoyée. », statut « Envoyée » | | |
| 6 | Sur Android (`reprographie`), lire le vocal envoyé depuis l'iPhone | Lecture correcte | | |
| 7 | Sur l'iPhone, ouvrir la demande au vocal enregistré sur Chrome Android et le lire | Lecture correcte (format converti `audio/mp4`) | | |
| 8 | Dans le fil, « Prendre une photo » avec l'appareil | Appareil photo ouvert ; photo jointe, orientation correcte | | |
| 9 | Dans le fil, joindre une photo **depuis la galerie** (photo HEIC d'origine) | Photo acceptée (convertie en JPEG par iOS) ou message clair si le format est refusé | | |
| 10 | Refuser l'accès au micro (Réglages → Safari → Micro) puis réessayer | Message expliquant comment autoriser le micro ; l'envoi d'une description écrite reste possible | | |

## Compte rendu

- Date :
- Modèle d'iPhone :
- Version d'iOS :
- Version de Safari :
- Adresse testée (recette / poste de développement) :
- Testeur :
- Conclusion (conforme / anomalies) :
- Anomalies (numéro du contrôle, description, capture) :
