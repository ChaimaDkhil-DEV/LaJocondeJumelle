# Guide de validation : Notifications push et préférences

Ce guide prouve que la fonctionnalité marche, de bout en bout. Il renvoie aux contrats
([http-api.md](contracts/http-api.md), [push-payload.md](contracts/push-payload.md), [ui.md](contracts/ui.md)) et au
[modèle de données](data-model.md) sans les répéter.

## Prérequis

- Base de développement locale (`localhost:5433`, voir `backend/.env`) ; la migration `0019_push_notifications` est
  appliquée par le hook du projet (`.claude/hooks/apply-migrations.js`) ou par
  `npm exec -w backend -- prisma migrate status` → « Database schema is up to date! ».
- Clés de test pour l'établissement, à générer **localement** et à ne jamais versionner :

  ```text
  npm exec -w backend -- web-push generate-vapid-keys
  ```

  Dans `backend/.env` : `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`,
  `PUSH_VAPID_SUBJECT=mailto:<adresse de l'établissement>`.
  Les tests ne lisent pas ces clés : l'intégration fixe sa propre configuration et le serveur e2e les vide.
- Pour un appareil réel : une adresse HTTPS. La démonstration en ligne (`npm run -w backend demo:en-ligne`, tunnel
  Cloudflare) ou la préproduction conviennent ; `localhost` ne marche que sur l'ordinateur lui-même.

## Tests automatisés (aucun appel à un vrai service de push)

```text
npm run verify                 # lint + tests (unitaires, intégration, frontend) + npm audit --audit-level=high
npm run test:e2e               # Playwright + axe, serveur e2e sans clés (push désactivé)
```

Attendu : tout passe ; `npm audit` sans vulnérabilité haute ou critique après l'ajout de `web-push@3.6.7`.

Couverture attendue (research R18) : correspondance exhaustive des types (SC-002), contenu sans donnée interdite
(SC-006), plage horaire, adresses autorisées, nouvelles tentatives, suppressions de D8/NC-8, droits et
`ACCESS_DENIED`, préférences, son, réglages et audit, chaîne action → envoyeur simulé, push en panne sans effet sur
les actions (SC-005), états de la section « Notifications », service worker.

## Scénarios manuels

### 1. Push désactivé (sans clés)

1. Retirer les trois variables `PUSH_VAPID_*`, redémarrer.
2. « Mon profil » → « Notifications » : état « Les notifications push ne sont pas activées par
   l'établissement. » ; catégories et son modifiables.
3. Créer une affectation : la cloche et l'alerte fonctionnent comme avant ; journaux sans erreur de push.

Configuration partielle (une seule variable) : le serveur refuse de démarrer avec un message explicite.

### 2. Android (Chrome), téléphone verrouillé — US1, SC-001

1. Sur le téléphone, se connecter en surveillant via l'adresse HTTPS ; « Mon profil » → « Activer les
   notifications sur cet appareil » → accepter. État « actives », appareil « Android · Chrome » listé.
2. Verrouiller le téléphone. Depuis un ordinateur, en administrateur, affecter une garde à ce surveillant.
3. Attendu : « Demande affectée » / « <classe> » s'affiche. Toucher : la garde s'ouvre ; la notification passe en
   lue dans la cloche **après** l'ouverture.
4. Laisser la session expirer (ou réduire `sessionIdleMinutes`), recommencer : le push arrive ; le toucher mène à
   la connexion, puis à la garde ; marquée lue seulement à ce moment.
5. Application ouverte au premier plan sur le téléphone : pas de notification système, alerte dans l'application
   seulement ; un second appareil abonné (ordinateur) reçoit le push.

### 3. iPhone — US2

1. Dans Safari (iOS ≥ 16.4) : la section affiche les étapes « Partager » puis « Sur l'écran d'accueil », sans
   bouton d'activation.
2. Ajouter à l'écran d'accueil, ouvrir depuis l'icône, se connecter, activer : état « actives », appareil
   « iPhone · Safari ».
3. Refaire le scénario 2 (étapes 2 et 3). Au premier plan, la notification peut s'afficher quand même (limite
   WebKit, research R13).
4. Un iPhone sous iOS < 16.4 : « Cet appareil ou ce navigateur ne permet pas les notifications push. »

### 4. Catégories et pointage — US3, D4

1. Désactiver « Couverture » (2 actions depuis « Mon profil ») ; sur l'autre appareil, la valeur apparaît
   désactivée.
2. Affecter une garde : aucun push, notification dans la cloche.
3. Enregistrer l'arrivée de l'enseignant sur une garde affectée : seul le surveillant affecté reçoit le push
   « Enseignant arrivé » ; les administrateurs le voient dans la cloche, sans push.

### 5. Plage horaire — US4

1. En super administrateur, « Réglages » : régler la plage pour qu'elle soit fermée maintenant.
2. Provoquer une notification autorisée : aucun push ; rien n'arrive non plus à la réouverture de la plage.
3. Journal d'audit : entrée `SETTING_CHANGED` avec valeurs avant et après.
4. En administrateur (`ADMIN`) : la modification est refusée.
5. Fin avant début : refus avec « L'heure de fin doit être après l'heure de début. »

### 6. Appareils, déconnexion, appareils partagés — US5

1. Deux appareils abonnés ; en retirer un depuis l'autre : il ne reçoit plus rien.
2. Se déconnecter du téléphone : il ne reçoit plus rien (SC-003) ; l'ordinateur oui.
3. Sur le même navigateur, un collègue se connecte et active le push : l'appareil passe dans sa liste et sort de
   la liste du premier.
4. Changer son mot de passe depuis l'ordinateur : les abonnements des autres appareils disparaissent, celui de
   l'ordinateur reste.
5. Un administrateur désactive le compte ou réinitialise le mot de passe : plus aucun appareil ne reçoit rien.

### 7. Son des urgences — NC-6

1. Avant la mise à jour, couper le son dans la cloche (valeur locale « désactivé »).
2. Après la mise à jour, ouvrir l'application : le son est désactivé sur le compte ; sur un autre appareil aussi.

## Contrôles derrière Caddy (préproduction)

Le tunnel de démonstration passe par Vite : ces points ne se vérifient qu'en préproduction.

- `curl -I https://<domaine>/sw.js` → `Cache-Control: no-cache` et un type JavaScript.
- `curl -I https://<domaine>/manifest.json` → `application/json`.
- Console du navigateur sans violation de la politique de sécurité du contenu, à l'enregistrement du service
  worker et à l'affichage d'une notification.
- `SCHOOL_TIMEZONE` vaut `Africa/Tunis`.

## Mesure SC-001 (préproduction)

- Appareils : au moins un Android avec Chrome et un iPhone avec l'application sur l'écran d'accueil ; écran
  verrouillé ; Wi-Fi ou 4G ; sans mode économie d'énergie ; push activé et dans la plage.
- 20 envois par plateforme (affectations successives), en notant l'heure de l'action et l'heure d'affichage
  (chronomètre ou capture d'écran horodatée).
- Attendu : au moins 95 % des affichages en moins de 10 s. Résultat à consigner dans
  `docs/validation/verification-014.md`, avec les conditions de mesure ; ce n'est pas une garantie.
