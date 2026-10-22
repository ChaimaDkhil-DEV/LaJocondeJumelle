# Quickstart — 006 Modification d'une affectation

Contrats : [contracts/rest-api.md](./contracts/rest-api.md), [contracts/ui.md](./contracts/ui.md).
Modèle : [data-model.md](./data-model.md).

## Prérequis

- `npm ci`, application de développement lancée (`start.bat`) : API 3002, interface 5173, base
  locale 5433 avec le seed de démonstration.
- Comptes : `admin` (surveillante générale), `superadmin`, `surveillant` (1er étage),
  `surveillant2` (2e étage), `enseignante`. Classes : « 1ère année Violet » (1er étage), « 2e année
  Bleu » (2e étage).
- Dans la journée de l'école (créneaux du jour).

## Contrôles automatiques

```text
npm run verify
npm run -w backend typecheck
npm run -w frontend typecheck
npm run test:e2e
```

## Scénarios

1. **Créneau (US1, FR-003, FR-004, FR-007, FR-010)** — en `admin`, créer une affectation directe
   (1ère année Violet, `surveillant`, maintenant → +1 h) ; « Modifier » : fin avancée de 30 min →
   « Affectation modifiée. » ; détail, « Mes affectations » de `surveillant` (sans recharger,
   SC-002) et notification « Affectation modifiée — Garde — 1ère année Violet » ; historique :
   « Affectation modifiée : … → … » ; journal d'audit (`superadmin`) : « Affectation gérée par un
   admin » avec avant et après.
2. **Créneau invalide (US1 scénario 5)** — fin avant le début, début dans 8 jours → message sous
   le champ, rien de modifié.
3. **Conflit nommé (US1 scénario 4, FR-006, SC-004)** — deux affectations de `surveillant` à des
   heures différentes ; modifier la seconde pour chevaucher la première → refus « Surveillant déjà
   affecté : 1ère année Violet, … », rien de modifié ; réassigner à `surveillant2`, puis modifier
   → accepté.
4. **Classe avant présence (US2, FR-005, FR-009, Q3)** — affectation « En route » : changer la
   classe → statut toujours « En route », notification avec la nouvelle classe ; QR code de
   l'ancienne classe refusé, de la nouvelle accepté.
5. **Pendant la présence (US1 scénario 6, US2 scénario 3)** — affectation « En cours » : seule
   l'heure de fin est modifiable ; fin dans le passé refusée ; fin plus tardive acceptée.
6. **Statuts définitifs et rôles (FR-001, FR-002)** — affectation terminée : pas de « Modifier » ;
   en `surveillant` ou `enseignante`, `PATCH /api/coverage/:id` → `404` et refus au journal.
7. **Concurrence (FR-012)** — deux onglets admin : modifier dans l'un puis dans l'autre → « La
   demande a été modifiée entre-temps. Elle a été rechargée. »
8. **Accessibilité (FR-013, SC-005)** — dialogue au clavier seul ; 320 px sans défilement
   horizontal ; axe sans violation.
