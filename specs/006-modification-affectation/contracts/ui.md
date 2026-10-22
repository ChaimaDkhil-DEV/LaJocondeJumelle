# Contrat d'interface — 006 Modification d'une affectation

## Bouton « Modifier » (détail `/gardes/:id`)

- Visible pour un admin ou le super administrateur quand `allowedActions` contient `UPDATE`.
- Ouvre le dialogue « Modifier l'affectation ».

## Dialogue « Modifier l'affectation »

| Champ | Libellé | Pré-rempli avec | Désactivé quand |
|-------|---------|-----------------|-----------------|
| Classe | « Classe » (liste des classes actives, avec salle et étage) | classe actuelle | `classId` absent de `modifiableFields` |
| Date | « Date » | date actuelle (fuseau de l'école) | `date` absent |
| Heure de début | « Heure de début (HH:MM) » | heure actuelle | `startTime` absent |
| Heure de fin | « Heure de fin (HH:MM) » | heure actuelle | `endTime` absent |

- Pendant la présence (seul `endTime` modifiable) : texte « Le surveillant est en classe : seule
  l'heure de fin peut changer. »
- Boutons « Annuler » et « Enregistrer ». « Enregistrer » envoie seulement les champs changés.
- Erreurs de champ (`VALIDATION_ERROR`, `INVALID_RANGE`) sous le champ concerné ; conflit
  (`NOT_AVAILABLE`) et autres refus dans une alerte du dialogue, message du serveur tel quel ;
  `STATE_CHANGED` : alerte puis rechargement du détail.
- Succès : dialogue fermé, toast « Affectation modifiée. » (annoncé), détail rafraîchi. Retours
  de succès et d'erreur au niveau de la mutation (le composant peut être démonté avant la réponse).
- Accessibilité : nom accessible du dialogue = son titre ; focus sur le premier champ modifiable ;
  ordre de tabulation des champs puis des boutons ; tient en 320 px sans défilement horizontal.

## Historique de l'affectation

Événement `UPDATED` modifié par un admin : « Affectation modifiée : classe 2e année Bleu → 1ère
année Violet ; 09:00–10:00 → 09:30–10:30 » (seuls les éléments changés ; dates affichées si le
jour change). Libellé générique « Affectation modifiée » à la place de « Demande modifiée ».

## Notification

Libellé du type `COVERAGE_UPDATED` : « Affectation modifiée » (était « Demande modifiée »).
Affichage existant : « Affectation modifiée — <titre> », le titre portant la nouvelle classe.

## Côté surveillant et enseignant

Aucun écran nouveau : « Mes affectations » (surveillant) et « Mes signalements » (enseignant)
affichent la nouvelle classe et le nouveau créneau, mis à jour en temps réel.
