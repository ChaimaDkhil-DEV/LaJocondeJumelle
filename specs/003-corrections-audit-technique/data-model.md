# Data Model: Corrections issues de l'audit technique

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

**Aucune migration de schéma.** Toutes les évolutions portent sur des champs JSON existants ou
sur des valeurs d'énumération déjà présentes. Le modèle complet reste celui de
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
- clé absente → personne lue dans la catégorie actuelle (comportement historique) ;
- clé présente à `null` en mode `AUTO` → aucune personne désignée → repli décrit ci-dessous.

### Résolution de l'employé à l'approbation (circuit B)

```text
mode = snapshot.assignmentMode
si mode = MANUAL :
    employé = assigneeId fourni par le responsable          → source MANAGER_CHOICE
si mode = AUTO :
    candidat = snapshot.autoAssigneeId si la clé existe       → source SNAPSHOT
               sinon Category.autoAssigneeId (actuelle)      → source CATEGORY_CURRENT
    si candidat affectable (actif ET destinataire actuel de la catégorie) :
        employé = candidat
    sinon si assigneeId fourni par le responsable et affectable :
        employé = assigneeId                                  → source MANAGER_CHOICE
    sinon :
        refus AUTO_ASSIGNEE_UNAVAILABLE (aucune écriture)
```

Un `assigneeId` fourni alors que le candidat figé est affectable est **ignoré** : la règle
figée prime (FR-008).

## RequestEvent (approbation) — détail de la source

L'événement d'approbation existant enregistre l'employé affecté dans `toValue`. Il gagne la
clé `assigneeSource` : `SNAPSHOT` | `CATEGORY_CURRENT` | `MANAGER_CHOICE`. Table en ajout seul
(triggers inchangés).

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

Entité de la spec, tenue dans `docs/ARCHITECTURE.md` (FR-024) : identifiant (A01–A35, N1–N2),
section source, marquage [VÉRIFIÉ]/[DÉDUIT], classe CT/DH/HP, statut (`ouvert`, `corrigé
(référence de commit)`, `confirmé`, `infirmé`). Pas de stockage en base.
