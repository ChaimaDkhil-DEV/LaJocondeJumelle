# Contrat temps réel et notifications — 004

Mécanisme inchangé : notification écrite dans la transaction (`notifyInTx`), publiée après commit
sur Socket.IO (`notification:new`, salle par utilisateur) ; l'auteur d'une action n'est jamais
notifié. Aucun canal externe. Événements de rafraîchissement : `coverage:updated` (inchangé) ;
`coverage:taken` n'est plus émis (plus de diffusion).

« Admins » = utilisateurs actifs de rôle `ADMIN` ; à défaut d'admin actif, les super
administrateurs. « SA » = super administrateurs actifs.

| Événement métier | Type | Priorité | Destinataires |
| --- | --- | --- | --- |
| Demande d'enseignant créée | `COVERAGE_REQUESTED` | demande | admins |
| Demande modifiée (en attente) | `COVERAGE_UPDATED` | demande | admins |
| Demande retirée par l'enseignant | `CANCELLED` | demande | admins |
| Classe vide déclarée | `COVERAGE_EMPTY_CLASS` | **URGENT** | admins |
| Assignation / réassignation | `ASSIGNED` | demande | surveillant assigné ; enseignant auteur |
| Affectation levée (annulation, réassignation) | `COVERAGE_LIFTED` | demande | ancien surveillant |
| Annulation par l'admin | `CANCELLED` | demande | enseignant auteur, surveillant |
| Délai de prise en charge expiré | `COVERAGE_TAKEOVER_EXPIRED` | **URGENT** | admins |
| Escalade (prise en charge, renfort, clôture) | `COVERAGE_ESCALATED` | **URGENT** | SA |
| Rappel de 7 h 00 | `COVERAGE_MORNING_REMINDER` | demande | admins |
| Rappel de clôture | `COVERAGE_CLOSE_REMINDER` | demande | surveillant, puis admins |
| Doublon (déjà assignée, rattachement, proposition) | `COVERAGE_DUPLICATE` | demande | admins ; le déclarant reçoit la réponse synchrone |
| Rappel de décision sur un renfort | `COVERAGE_SUPPORT_REMINDER` | **URGENT** | admins |
| Surveillant avec deux affectations actives | `COVERAGE_DOUBLE_ASSIGNMENT` | **URGENT** | admins |
| Présence confirmée, relève, retard d'arrivée, prolongation, relevé | types existants | inchangé | admins à la place des responsables de catégorie |
| Non pourvue | `COVERAGE_UNFILLED` (existant) | demande | admins, enseignant auteur |

Note : l'enseignant auteur est notifié de l'assignation et de la réassignation (FR-017a) : classe, créneau, nom du surveillant.

## Mise en évidence (FR-024a)

`priority = URGENT` déclenche dans `NotificationCenter` (existant) : fond et libellé « Urgent »,
région `aria-live="assertive"`, Snackbar persistant `role="alert"`. Ajout : signal sonore court
(Web Audio API), **facultatif** (préférence locale, désactivable), joué seulement après une
interaction de l'utilisateur ; jamais seul porteur de l'information.
