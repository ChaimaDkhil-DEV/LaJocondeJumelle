# Data Model: Corrections issues de l'audit technique

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

**Une seule migration de schéma** : `0003_request_event_seq` ajoute `RequestEvent.seq` (N3,
R15). Toutes les autres évolutions portent sur des champs JSON existants ou sur des valeurs
d'énumération déjà présentes. Le modèle complet reste celui de
[`specs/001-demandes-travail-vocales/data-model.md`](../001-demandes-travail-vocales/data-model.md).

## Request.rulesSnapshot (JSON) — ajout d'une clé

| Clé | Type | Origine | Règle |
|-----|------|---------|-------|
| `autoAssigneeId` | `string (uuid) \| null` | `Category.autoAssigneeId` à la soumission | **Nouvelle.** Renseignée si `assignmentMode = AUTO`, sinon `null`. |
| `assignmentMode` | `MANUAL \| AUTO` | inchangé | Désormais lue à l'approbation (au lieu de `Category.assignmentMode`). |

Les autres clés (`circuit`, `closureMode`, `autoCloseAfterMinutes`, `finalValidation`,
`photoRequired`, durées de délais) sont inchangées.

**Compatibilité**: les demandes soumises avant la correction n'ont pas la clé
`autoAssigneeId`. **Absence de clé ≠ `null`** :
- clé absente → exception **EXC-1** (décision D9) : personne lue dans la catégorie actuelle ;
- clé présente à `null` en mode `AUTO` → aucune personne désignée → exception **EXC-2**
  (décision D8), comme une personne non affectable.

### Résolution de l'employé à l'approbation (circuit B) — FR-008, FR-011

« Affectable » = compte actif **et** destinataire actuel de la catégorie (`canPickRecipient`).

```text
mode = snapshot.assignmentMode                         (jamais Category.assignmentMode)
si mode = MANUAL :
    si assigneeId absent            → refus ASSIGNEE_REQUIRED          (inchangé)
    si assigneeId non affectable    → refus RECIPIENT_NOT_ALLOWED      (inchangé)
    sinon employé = assigneeId                         → source MANAGER_CHOICE
si mode = AUTO :
    si la clé snapshot.autoAssigneeId existe : candidat = snapshot.autoAssigneeId  → SNAPSHOT
    sinon (EXC-1, D9) :                        candidat = Category.autoAssigneeId  → CATEGORY_CURRENT
    si candidat non nul et affectable :
        employé = candidat      (un assigneeId fourni est ignoré, FR-008)
    sinon (EXC-2, D8) :
        si assigneeId absent         → refus AUTO_ASSIGNEE_UNAVAILABLE (aucune écriture)
        si assigneeId non affectable → refus RECIPIENT_NOT_ALLOWED     (aucune écriture)
        sinon employé = assigneeId                     → source MANAGER_CHOICE
```

## RequestEvent (approbation) — détail de la source

L'événement `ASSIGNED` existant, créé par l'approbation, enregistre l'employé affecté dans
`toValue` (`assigneeId`). Il gagne la clé `assigneeSource` : `SNAPSHOT` | `CATEGORY_CURRENT`
(EXC-1, D9) | `MANAGER_CHOICE` (mode manuel, ou EXC-2, D8). L'événement `STATUS_CHANGED` de la
même approbation est inchangé. L'historique affiche cette source (T031). Table en ajout seul
(triggers inchangés).

## RequestEvent — ordre d'écriture (FR-025, N3)

| Champ | Type | Règle |
|-------|------|-------|
| `seq` | `BigInt`, `BIGSERIAL NOT NULL` | Attribué par la base à l'insertion ; second critère de tri après `createdAt` dans toute lecture chronologique ; jamais exposé par l'API |

Migration : `ALTER TABLE "RequestEvent" ADD COLUMN "seq" BIGSERIAL NOT NULL;`. La table reste en
ajout seul (triggers inchangés).

## AuditLog — réinitialisation par l'outil d'exploitation

Aucune nouvelle valeur : l'action `PASSWORD_RESET` existe déjà dans `AuditAction`.

| Champ | Valeur |
|-------|--------|
| `action` | `PASSWORD_RESET` |
| `actorId` | `null` (action hors interface, pas d'utilisateur connecté) |
| `targetType` / `targetId` | `User` / identifiant du super administrateur |
| `details` | `{ "reason": "CLI" }` (clé déjà en liste blanche) |
| `ip` | `null` |

Effets dans la même transaction : `User.passwordHash` remplacé, `User.mustChangePassword = true`,
toutes les lignes `Session` du compte supprimées.

## Configuration (AppConfig) — nouvelle valeur validée

| Champ | Variable | Défaut | Validation |
|-------|----------|--------|------------|
| `trustProxy` | `TRUST_PROXY` | `loopback` | Voir [contracts/configuration.md](./contracts/configuration.md) |
| `port` | `PORT` | `3002` | Entier 1–65535 (inchangé ; désormais seule source pour l'écoute) |

## Registre des constats (documentaire)

Entité de la spec, tenue dans `docs/ARCHITECTURE.md` (FR-024) : identifiant (A01–A35, N1–N3),
section source, marquage [VÉRIFIÉ]/[DÉDUIT], classe CT/DH/HP, statut (`ouvert`, `corrigé
(référence de commit)`, `confirmé`, `infirmé`). Pas de stockage en base.
