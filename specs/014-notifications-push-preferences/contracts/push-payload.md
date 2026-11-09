# Contrat : contenu d'un push et comportement de l'appareil

## Message envoyé par le serveur

Chiffré selon le protocole Web Push (RFC 8291), signé par les clés de l'établissement (RFC 8292).

```json
{ "v": 1, "id": "3f1c…-uuid", "type": "COVERAGE_EMPTY_CLASS", "place": "CE1 Vert", "url": "/gardes/9b2e…-uuid" }
```

| Champ | Contenu | Règle |
|---|---|---|
| `v` | `1` | Version du format |
| `id` | Identifiant de la notification | Sert de `tag` (remplacement à l'affichage) et au marquage comme lu (FR-008) |
| `type` | Type de notification autorisé en push | Un des 16 types de la correspondance validée |
| `place` | Nom de la classe (garde) ou référence `D-AAAA-NNNNNN` (demande de travail) | Rien d'autre |
| `url` | `/gardes/<requestId>` ou `/demandes/<requestId>` | Chemin relatif de l'application, jamais une adresse absolue |

**Interdit** (vérifié par test pour chaque type autorisé, SC-006) : titre, description, contenu de message, nom ou
identifiant d'une personne (enseignant, élève, surveillant, demandeur), priorité, statut, motif, tout autre champ.

**Options d'envoi** : `TTL` 1800 s, `urgency: high`, `topic` = `id` sans tirets ; 10 s au plus par requête.

## Texte affiché sur l'appareil

Composé par le service worker. La langue vient de l'adresse d'enregistrement (`/sw.js?lang=fr|en`).

- **Titre** : libellé du type, identique à `NOTIFICATION_LABELS` (et à sa traduction anglaise).
- **Corps** : `place`.
- **Exemples** : « Classe vide signalée » / « CE1 Vert » ; « Absence annoncée mais enseignant présent » /
  « CE1 Vert » ; « Demande urgente » / « D-2026-000123 ».

| Type | Libellé (fr) |
|---|---|
| `URGENT` | Demande urgente |
| `ASSIGNED` (garde) | Demande affectée |
| `COVERAGE_REQUESTED` | Retard ou absence signalé |
| `COVERAGE_EMPTY_CLASS` | Classe vide signalée |
| `COVERAGE_LIFTED` | Affectation levée |
| `COVERAGE_UPDATED` | Affectation modifiée |
| `COVERAGE_EXTENDED` | Garde prolongée |
| `COVERAGE_RELIEF_REQUESTED` | Relève demandée |
| `COVERAGE_LATE` | Garde en retard |
| `COVERAGE_DOUBLE_ASSIGNMENT` | Surveillant sur deux affectations |
| `COVERAGE_SUPPORT_REMINDER` | Renfort à décider |
| `COVERAGE_TAKEOVER_EXPIRED` | Demande en attente d'assignation |
| `COVERAGE_ESCALATED` | Alerte non traitée |
| `COVERAGE_UNFILLED` | Garde non pourvue |
| `COVERAGE_TEACHER_ARRIVED` | Enseignant arrivé |
| `COVERAGE_ATTENDANCE_ANOMALY` | Absence annoncée mais enseignant présent |

16 types. `ASSIGNED` n'est envoyé que sur une garde ; sur une demande de travail, il reste dans l'application.

## Comportement du service worker

| Événement | Comportement |
|---|---|
| `push` | Lit le JSON ; s'il est invalide (version, type inconnu, `url` non relative), rien n'est affiché sauf sur iPhone/iPad, où une notification générique « Nouvelle notification » s'affiche (exigence WebKit). Si une fenêtre de l'application est visible et active, et que l'appareil n'est pas un iPhone/iPad, pas de notification système (D10). Sinon : `showNotification(titre, { body: place, tag: id, data: { url, id }, icon, badge })`. |
| `notificationclick` | Ferme la notification ; met au premier plan une fenêtre de l'application et la dirige vers `url?notification=<id>`, ou en ouvre une. N'ouvre jamais une autre origine. |
| `install` / `activate` | `skipWaiting()` puis `clients.claim()`. |
| `fetch` | **Aucun gestionnaire** : rien n'est intercepté ni mis en cache. |

## Après l'ouverture

La page de détail charge la ressource. **Si le chargement réussit**, elle appelle
`POST /api/notifications/read { ids: [id] }`, puis retire `notification` de l'adresse. Si la session a expiré :
connexion, retour à la même adresse (paramètre conservé), puis même règle. En cas d'échec (droits retirés, garde
anonymisée) : message d'erreur habituel, notification non marquée lue.
