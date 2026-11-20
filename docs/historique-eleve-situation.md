# Historique de classe et situation d'un élève (spec 021)

> Pour l'administration (rôles `ADMIN` et `SUPER_ADMIN`). Spécification : `specs/021-historique-eleve-situation/`.

## À quoi ça sert

Répondre, à partir d'une date et d'une heure précises, à la question d'un parent ou d'un assureur après un incident :
dans quelle classe était l'élève, quelle séance était prévue, quel enseignant était réellement là, qui remplaçait,
qui surveillait. L'application ne crée aucun fait nouveau : elle rassemble ceux qu'elle enregistre déjà.

## Où le trouver

**Administration → Élèves**, bouton « Historique de classe » sur la ligne de l'élève. Le tiroir contient :

1. **Les classes successives** de l'élève, avec la date de début, la date de fin (début de la période suivante) et
   l'auteur du changement.
2. **Situation à un instant donné** : saisir la date et l'heure (heure de l'école), puis « Voir la situation ».
   « Imprimer la situation » produit une page avec l'auteur et l'heure d'édition.
3. **Journal de l'élève** : les modifications de sa fiche (classe avant et après) et les consultations de sa situation.

## Lire la disponibilité de chaque rubrique

| Mention | Sens |
|---|---|
| **Connue** | Une valeur a été enregistrée. |
| **Probable** | Déduite de la classe actuelle pour une période antérieure à la mise en service : un changement de classe a pu ne pas être enregistré. |
| **Aucune information enregistrée** | Les enregistrements montrent que rien n'a eu lieu (pas de séance, pas d'annonce, pas de garde). |
| **Indisponible** | Rien n'existe et rien ne peut être déduit (avant la création de l'élève). |

Règles à retenir :

- Un enseignant sans arrivée enregistrée est « aucune arrivée enregistrée », jamais « absent » : une absence est une
  saisie faite par une personne.
- Une classe sans garde enregistrée n'est pas « sans surveillance » : il n'existe pas de planning de surveillance.
- L'arrivée d'un enseignant est enregistrée **par classe et par jour**, pas par séance. Si l'enseignant a plusieurs
  séances dans cette classe ce jour-là, la page l'indique.
- Un pointage corrigé s'affiche avec sa valeur corrigée et la mention « Arrivée corrigée » ; l'original, le motif,
  l'auteur et l'heure de la correction figurent sous « Modifications », avec « Fait après l'instant demandé » quand la
  correction est postérieure.
- L'instant est évalué à la **fin de la minute** demandée : un fait enregistré pendant cette minute compte.

## Mise en service

À l'application de la migration `0032_student_class_history`, chaque élève existant reçoit une période « reconstituée »
(sa classe actuelle depuis sa date de création). Les changements de classe faits avant cette date ne sont pas
récupérables : la classe est alors donnée comme **probable**, avec l'avertissement « non garantie ». À partir de la
mise en service, chaque création ou changement de classe (formulaire, import CSV) ajoute une période.

## Traçabilité et protection des données

- Réservé à l'administration ; tout autre rôle reçoit un refus journalisé qui ne révèle rien sur l'élève.
- Chaque consultation de situation est journalisée (`STUDENT_SITUATION_VIEWED` : auteur, élève, instant, adresse IP).
- La table `StudentClassHistory` est en ajout seul : la base refuse toute modification, suppression ou vidage.
- Le journal d'audit d'une fiche élève garde l'avant et l'après de la classe, du nom, du prénom et de l'état actif ;
  **jamais le téléphone d'un parent** (seule la mention « modifié » figure).

## Conservation

L'historique de classe suit la durée de conservation de la fiche de l'élève. Aucune politique de conservation
dédiée n'existe : c'est une décision à prendre avec l'établissement (hors périmètre de la spec 021).

## Retour arrière

`backend/prisma/migrations/0032_student_class_history/down.sql` : il s'arrête si des changements de classe ont été
enregistrés depuis la mise en service ou si une consultation a été journalisée ; dans ce cas, seule la restauration de
la sauvegarde prise avant la migration est fiable.

## Hors périmètre

Registre d'incidents, planning de surveillance, présence de l'élève, accès des parents.
