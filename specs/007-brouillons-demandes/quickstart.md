# Quickstart — 007 Brouillons de demande de travail

Contrats : [contracts/rest-api.md](./contracts/rest-api.md), [contracts/ui.md](./contracts/ui.md).

## Prérequis

- `npm ci`, application de développement lancée (`start.bat`), seed de démonstration.
- Comptes : `enseignante` (auteur), `reprographie` (destinataire de « Photocopies »), `superadmin`
  (réglages).

## Contrôles automatiques

```text
npm run verify
npm run -w backend typecheck
npm run -w frontend typecheck
npm run test:e2e
```

## Scénarios

1. **Enregistrer en brouillon (US1, FR-001 à FR-003)** — en `enseignante`, « Nouvelle demande » :
   catégorie « Photocopies », titre, message vocal → « Enregistrer en brouillon » ; « Brouillon
   enregistré. » ; `reprographie` ne reçoit aucune notification et ne voit rien.
2. **Validation réduite (US1 scénario 2)** — sans titre → « Saisissez un titre. », rien d'enregistré.
3. **Onglet (US2, FR-004, FR-004b)** — « Mes demandes » : onglet « Brouillons » présent avec le
   brouillon ; « Envoyées » ne le contient pas ; sans brouillon, pas d'onglet.
4. **Reprendre et envoyer (US2, FR-005 à FR-007, SC-003)** — ouvrir le brouillon : formulaire
   pré-rempli, vocal réécoutable ; compléter la description ; « Envoyer la demande » → détail de la
   demande « Envoyée » ; `reprographie` notifiée comme pour une création directe.
5. **Envoi incomplet (US2 scénario 4)** — brouillon sans description ni vocal → message, rien envoyé.
6. **Supprimer (US3)** — « Supprimer le brouillon » → confirmation → « Brouillon supprimé. » ;
   annuler la confirmation ne supprime rien.
7. **Réglage désactivé (FR-001, FR-008)** — en `superadmin`, désactiver « Autoriser les brouillons
   de demande » ; « Enregistrer en brouillon » disparaît ; un brouillon existant reste ouvrable,
   enregistrable, envoyable et supprimable.
8. **Accessibilité (FR-010, SC-005)** — clavier seul, 320 px, axe sans violation.
