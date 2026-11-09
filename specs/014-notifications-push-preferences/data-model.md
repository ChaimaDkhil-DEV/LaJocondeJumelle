# Modèle de données : Notifications push et préférences utilisateur

**Spec** : [spec.md](spec.md) | **Recherche** : [research.md](research.md)

Deux nouvelles tables, trois nouveaux réglages globaux, **aucune modification** de `Notification` ni des tables
existantes. Les seuls ajouts sur `User` sont deux relations Prisma, sans colonne en base. Migration :
`backend/prisma/migrations/0019_push_notifications/` (`migration.sql` + `down.sql`), créée par
`prisma migrate dev` sur la base locale seulement (CLAUDE.md).

## PushSubscription — abonnement push d'un appareil

Un navigateur (appareil) autorisé à recevoir les push d'un utilisateur.

| Champ | Type | Règles |
|---|---|---|
| `id` | UUID | Clé primaire |
| `userId` | UUID → `User` | Obligatoire ; `onDelete: Cascade` (les comptes sont désactivés, pas supprimés) |
| `sessionId` | texte (128), nullable | Session qui a créé ou utilisé l'abonnement en dernier. **Pas de clé étrangère** (research R8) |
| `endpoint` | texte (2048), **unique** | Adresse d'envoi ; https, hôte autorisé (R9) ; jamais journalisée en clair |
| `p256dh` | texte (128) | Clé publique de l'abonnement, base64url, 65 octets décodés |
| `auth` | texte (64) | Secret d'authentification, base64url, 16 octets décodés |
| `deviceLabel` | texte (80) | Calculé par le serveur depuis l'agent utilisateur (R16), ex. « iPhone · Safari » |
| `createdAt` | horodatage | Défaut : maintenant |
| `lastSuccessAt` | horodatage, nullable | Dernier envoi accepté par le service de push |
| `lastUsedAt` | horodatage | Dernière ouverture authentifiée de l'application sur l'appareil (NC-3) ; mis à jour au plus une fois par 24 h |

Index : `userId`, `sessionId`, `lastUsedAt` ; unicité sur `endpoint`.

**Règles** :

- Au plus 10 abonnements par utilisateur (R17).
- Enregistrement = upsert sur `endpoint` : s'il appartient à un autre utilisateur, `userId`, `sessionId`, clés,
  libellé et `lastUsedAt` sont remplacés (bascule NC-8a). L'ancien propriétaire n'y reçoit plus rien.
- Suppression :

| Événement | Abonnements supprimés | Où |
|---|---|---|
| Retrait par l'utilisateur | Celui choisi (le sien seulement) | `DELETE /api/push/subscriptions/:id` |
| Déconnexion explicite | `sessionId` = session fermée | `AuthService.logout` |
| Changement de son mot de passe | Ceux de l'utilisateur dont `sessionId` ≠ session courante ou vide | `AuthService.changePassword` |
| Réinitialisation du mot de passe par un administrateur | Tous ceux de l'utilisateur, dans la transaction qui supprime ses sessions | `UsersService.resetPassword` |
| Désactivation du compte | Tous ceux de l'utilisateur, dans la même transaction | `UsersService.update` |
| Réponse 404 ou 410 du service de push | Celui concerné | `PushDispatcher` |
| 90 jours sans utilisation | `lastUsedAt` < maintenant − 90 j | job horaire `push-subscriptions-cleanup` |

## NotificationPreference — préférences de notification d'un utilisateur

Créée à la première modification ; tant qu'elle n'existe pas, les valeurs par défaut s'appliquent.

| Champ | Type | Règles |
|---|---|---|
| `userId` | UUID → `User`, clé primaire | `onDelete: Cascade` |
| `urgent` | booléen | Défaut `true` — catégorie Urgent |
| `coverage` | booléen | Défaut `true` — catégorie Couverture |
| `unfilled` | booléen | Défaut `true` — catégorie Garde non pourvue |
| `attendance` | booléen | Défaut `true` — catégorie Pointage |
| `urgentSound` | booléen, **nullable** | `null` = jamais réglé (son actif) ; sert à la reprise unique de la valeur locale (NC-6) |
| `updatedAt` | horodatage | Mis à jour automatiquement |

**Règles** : modification partielle, champ par champ ; la dernière écriture l'emporte (NC-9). Seul l'utilisateur
modifie ses préférences (FR-018). Elles sont relues à chaque envoi.

## Réglages globaux ajoutés (table `Setting` existante)

| Clé | Valeur par défaut | Validation |
|---|---|---|
| `pushWindowDays` | `["MON", "TUE", "WED", "THU", "FRI"]` | Liste non vide de codes de jour distincts parmi `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN` (règle `subset` existante, qui n'accepte que des chaînes) |
| `pushWindowStart` | `"07:30"` | `HH:MM` |
| `pushWindowEnd` | `"18:30"` | `HH:MM`, strictement après `pushWindowStart` (contrôle croisé) |

Super administrateur seul (garde existante) ; chaque modification donne une entrée d'audit `SETTING_CHANGED` avec
les valeurs avant et après. Aucune migration : les défauts sont dans le code (`SETTING_DEFAULTS`).

## Configuration (environnement, pas en base)

| Variable | Rôle |
|---|---|
| `PUSH_VAPID_PUBLIC_KEY` | Clé publique, transmise au navigateur |
| `PUSH_VAPID_PRIVATE_KEY` | Clé privée, jamais exposée ni journalisée |
| `PUSH_VAPID_SUBJECT` | Contact de l'établissement, `mailto:` ou `https:` |

Les trois absentes : push désactivé. Configuration partielle ou invalide : erreur au démarrage.

## Catégorie d'une notification (calculée, non stockée)

`pushCategoryOf(type, requestKind)` donne `urgent`, `coverage`, `unfilled`, `attendance` ou `null`, selon le tableau
validé de la spec. Filtre supplémentaire pour `COVERAGE_TEACHER_ARRIVED` : seul le surveillant affecté reçoit le push.

## Décision d'envoi (pour chaque notification créée × destinataire)

1. Push activé par l'établissement (clés présentes).
2. Catégorie non nulle, et filtre D4 respecté.
3. Compte du destinataire actif.
4. Catégorie active dans ses préférences.
5. Moment présent dans la plage horaire (fuseau de l'école).
6. Pour chaque abonnement du destinataire : envoi avec nouvelles tentatives (R7).

Si une condition échoue, rien n'est envoyé ; la notification reste dans l'application.
