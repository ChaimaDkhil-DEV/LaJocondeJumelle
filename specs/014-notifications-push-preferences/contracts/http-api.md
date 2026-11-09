# Contrat HTTP : Notifications push et préférences

Toutes les routes exigent une session valide (`SessionGuard` global) et passent par le contrôle d'origine
existant pour les écritures. Les erreurs suivent le format habituel
`{ error: { code, message, details? } }`, les champs invalides dans `details.fields` (`backend/src/common/errors.ts`, filtre d’exceptions). Nouveaux codes :

| Code | Statut | Message |
|---|---|---|
| `PUSH_DISABLED` | 409 | « Les notifications push ne sont pas activées par l'établissement. » |
| `PUSH_DEVICE_LIMIT` | 409 | « Vous avez déjà 10 appareils abonnés. Retirez-en un pour activer celui-ci. » |

Aucune réponse ni aucun journal ne contient l'adresse d'envoi complète ou les clés d'un abonnement.

---

## `GET /api/push/config`

Configuration utile au navigateur.

**200**

```json
{ "enabled": true, "publicKey": "BPx…base64url…" }
```

`enabled: false` et `publicKey: null` quand les clés ne sont pas configurées.

---

## `PUT /api/push/subscriptions`

Enregistre l'appareil courant pour l'utilisateur, ou met à jour son enregistrement. Upsert sur `endpoint`. Appelé
à l'activation et à chaque ouverture de l'application quand le navigateur a un abonnement : met à jour
`sessionId` et `lastUsedAt` (au plus une écriture par 24 h).

**Corps**

```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/…", "keys": { "p256dh": "…", "auth": "…" } }
```

- `endpoint` : https, 2048 caractères au plus, hôte autorisé (research R9).
- `keys.p256dh` : base64url, 65 octets décodés, premier octet `0x04`.
- `keys.auth` : base64url, 16 octets décodés.
- Champs inconnus refusés (`whitelist` + `forbidNonWhitelisted`, comme les autres DTO).

**Réponses**

- **200** `{ "id": "<uuid>", "deviceLabel": "iPhone · Safari", "created": false }` (déjà connu, ou transféré
  depuis un autre utilisateur)
- **201** `{ "id": "<uuid>", "deviceLabel": "Android · Chrome", "created": true }`
- **400** `VALIDATION_ERROR` (champ `endpoint` ou `keys`)
- **409** `PUSH_DISABLED`, `PUSH_DEVICE_LIMIT`

---

## `GET /api/push/subscriptions`

Appareils abonnés de l'utilisateur courant, du plus récent au plus ancien.

**200**

```json
[
  { "id": "<uuid>", "deviceLabel": "iPhone · Safari", "createdAt": "2026-11-10T07:41:00.000Z",
    "lastUsedAt": "2026-11-12T07:35:00.000Z", "current": true }
]
```

`current` : `sessionId` de l'abonnement égal à la session de la requête. Fonctionne même si le push est
désactivé (l'utilisateur peut retirer ses anciens appareils).

---

## `DELETE /api/push/subscriptions/:id`

Retire un appareil de l'utilisateur courant.

- **204** supprimé.
- **404** `NOT_FOUND` si l'identifiant n'existe pas **ou appartient à un autre utilisateur**. Dans ce second cas,
  une entrée d'audit `ACCESS_DENIED` est écrite, sans révéler l'existence de l'abonnement (principe V).

## `DELETE /api/push/subscriptions/current`

Retire l'abonnement lié à la session courante, appelé par le navigateur juste avant la déconnexion. **204**
même s'il n'y en a aucun. La déconnexion côté serveur supprime de toute façon les abonnements de la session
(data-model).

---

## `GET /api/notifications/preferences`

**200**

```json
{
  "categories": { "urgent": true, "coverage": true, "unfilled": true, "attendance": true },
  "urgentSound": true,
  "urgentSoundSet": false
}
```

Valeurs par défaut si l'utilisateur n'a encore rien modifié. `urgentSoundSet: false` signifie que le son n'a
jamais été réglé sur le compte (`urgentSound` vaut `null` en base) : le navigateur peut alors reprendre une
valeur locale « désactivé » (NC-6).

## `PATCH /api/notifications/preferences`

Modification partielle ; seuls les champs présents changent (la dernière écriture l'emporte, NC-9).

**Corps** (tous facultatifs, au moins un)

```json
{ "categories": { "coverage": false }, "urgentSound": false }
```

- **200** : préférences complètes, au format du `GET`.
- **400** `VALIDATION_ERROR` : corps vide, champ inconnu ou valeur non booléenne.

Fonctionne même si le push est désactivé.

---

## Réglages de l'établissement (routes existantes, nouvelles clés)

`GET /api/admin/settings` et `PUT /api/admin/settings` (super administrateur seul, `SuperAdminGuard`) gèrent
trois nouvelles clés :

```json
{ "pushWindowDays": ["MON", "TUE", "WED", "THU", "FRI"], "pushWindowStart": "07:30", "pushWindowEnd": "18:30" }
```

- `pushWindowDays` : liste non vide de codes distincts parmi `MON` … `SUN` (règle `subset` existante).
- `pushWindowStart`, `pushWindowEnd` : `HH:MM` ; la fin doit suivre strictement le début (contrôle sur les valeurs
  fusionnées). Sinon **400** `VALIDATION_ERROR` sur `pushWindowEnd`, avec le message « L'heure de fin doit être
  après l'heure de début. »
- Chaque clé modifiée : audit `SETTING_CHANGED` `{ key, before, after }` (inchangé).
- Toute autre personne : **403**, refus journalisé (comportement existant).

`GET /api/settings/client` (route existante, tout utilisateur connecté) renvoie en plus `pushWindowDays`,
`pushWindowStart` et `pushWindowEnd`, pour la mention de la plage dans « Mon profil ».

---

## Routes existantes réutilisées

- `POST /api/notifications/read { ids: [id] }` : appelé par la page de détail après l'ouverture réussie d'une
  ressource venant d'un push (FR-008). Inchangé : ne marque que les notifications de l'utilisateur.
- `POST /api/auth/logout` : supprime en plus les abonnements de la session fermée.
- `POST /api/auth/password` : supprime en plus les abonnements des autres appareils.
- Routes d'administration des utilisateurs (désactivation, réinitialisation du mot de passe) : suppriment en plus
  tous les abonnements de l'utilisateur, dans la même transaction.
