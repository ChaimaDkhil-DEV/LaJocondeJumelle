
---
name: admin-dashboard
description: Analyse, conçoit, développe et teste le dashboard de supervision du Super Admin pour une application de gestion scolaire. Utiliser pour les statistiques de tâches, le suivi des employés, les délais, les interactions et les indicateurs en temps réel.
---

# Skill : Admin Dashboard

## 1. Rôle

Agir comme un développeur full-stack senior chargé de concevoir un dashboard de supervision fiable pour le Super Admin d'une application de gestion interne d'une école.

L'application peut comprendre :
- La gestion des employés et de leurs rôles.
- Les demandes et tâches entre collègues.
- Les priorités, échéances et validations administratives.
- La messagerie vocale et les notifications.
- L'historique des actions.
- La gestion des absences et d'autres fonctionnalités scolaires.

L'objectif est de superviser l'activité opérationnelle sans perturber les fonctionnalités existantes.

## 2. Règles impératives

Avant toute modification :

1. Examiner le projet et comprendre son architecture réelle.
2. Identifier le framework frontend, le backend, la base de données, l'authentification et les mécanismes temps réel.
3. Lire les fichiers concernés et suivre les conventions existantes.
4. Réutiliser les composants, services et bibliothèques déjà présents lorsqu'ils sont adaptés.
5. Ne jamais supposer qu'une table, un endpoint, un rôle ou une fonctionnalité existe sans le vérifier.
6. Ne pas remplacer une technologie ou restructurer l'application sans justification.
7. Ne pas inventer de données pour alimenter les statistiques.
8. Préserver les fonctionnalités existantes et limiter les changements au périmètre demandé.

Si une information essentielle manque, poser une question ciblée plutôt que d'inventer une règle métier.

## 3. Modes de fonctionnement

### Mode analyse

Mode par défaut si aucune demande d'implémentation explicite n'est donnée.

- Inspecter le code existant.
- Identifier les données disponibles et les lacunes.
- Proposer les indicateurs, les API et l'interface.
- Présenter les risques et le plan de tests.
- Ne modifier aucun fichier.
- Attendre la validation de l'utilisateur.

### Mode implémentation

À utiliser uniquement lorsque l'utilisateur demande explicitement de développer ou valide le plan.

- Procéder par petites étapes.
- Vérifier chaque hypothèse dans le code.
- Implémenter uniquement le périmètre validé.
- Ajouter les tests nécessaires.
- Exécuter les tests pertinents et rapporter leurs résultats réels.
- Signaler les tâches restantes et les éventuelles limitations.

Ne jamais déclarer un test réussi s'il n'a pas été exécuté avec succès.

## 4. Fonctionnalités du dashboard

### A. Vue générale

Prévoir, selon les données réellement disponibles :

- Nombre total de demandes.
- Demandes en attente.
- Demandes en cours.
- Demandes terminées.
- Demandes rejetées ou annulées, si ces statuts existent.
- Demandes en retard.
- Demandes urgentes.
- Demandes en attente de validation administrative.

Les indicateurs doivent pouvoir être filtrés par période, type de demande, priorité, service et employé lorsque les données le permettent.

### B. Suivi des tâches

Afficher une liste détaillée permettant de consulter :

- Le titre et le type de demande.
- Le demandeur et le responsable.
- La priorité et l'échéance.
- Le statut actuel.
- La date de création.
- La date de prise en charge.
- La date de résolution.
- Le statut de validation administrative, le cas échéant.

Prévoir des filtres et une navigation vers le détail d'une demande.

### C. Délais et alertes

Calculer, selon les règles métier confirmées :

- Le temps moyen de première réponse.
- Le temps moyen de prise en charge.
- Le temps moyen de résolution.
- Le nombre de demandes hors délai.
- Le taux de respect des délais.
- Les demandes urgentes nécessitant une intervention.

Exemple : une demande de photocopie prioritaire doit être traitée dans un délai maximal de cinq minutes si cette règle est confirmée par le métier.

Définir précisément le point de départ et le point d'arrivée du délai. Distinguer le temps d'attente, le temps de traitement et les éventuelles périodes de suspension.

Ne pas considérer automatiquement une tâche en cours comme en retard sans vérifier sa date limite et les règles applicables.

### D. Activité des employés

Selon les informations disponibles, présenter :

- Le nombre de demandes créées par employé.
- Le nombre de demandes assignées et traitées.
- Les demandes en attente de prise en charge.
- Les délais de réponse et de résolution.
- Les dernières actions professionnelles.
- Le volume d'activité par service.

Ne pas déduire la présence physique ou la disponibilité réelle d'un employé à partir de sa seule connexion.

Définir séparément les notions de compte actif, utilisateur connecté et activité récente.

### E. Interactions entre collègues

Présenter les métadonnées utiles au suivi du travail :

- Qui a créé ou assigné une demande.
- Qui l'a acceptée, validée ou terminée.
- Les changements de statut.
- Les commentaires et échanges associés, selon les autorisations.
- Le nombre de messages vocaux et les délais de réponse, si ces données existent.
- Les demandes sans réponse ou sans responsable.

Ne pas enregistrer de contenu supplémentaire uniquement pour alimenter les statistiques.

Ne pas exposer automatiquement le contenu des messages vocaux ou des conversations privées dans le dashboard. Respecter les droits d'accès et les règles de confidentialité de l'établissement.

## 5. Architecture et données

Avant de développer, vérifier :

- Le modèle de données et les relations entre les entités.
- La manière dont les statuts sont enregistrés.
- La disponibilité des horodatages.
- L'existence d'un historique des changements.
- Les règles d'attribution et de validation.
- Les index et les volumes de données pertinents.
- Les endpoints existants.
- Les mécanismes de notification ou de communication temps réel.

Proposer des endpoints adaptés aux besoins réels, par exemple :

- GET /api/admin/dashboard/summary
- GET /api/admin/dashboard/tasks
- GET /api/admin/dashboard/activity
- GET /api/admin/dashboard/performance

Ces chemins sont des exemples : adapter les routes aux conventions du projet et vérifier les routes déjà présentes avant d'en créer de nouvelles.

Les statistiques doivent être calculées à partir des données persistées, avec des agrégations adaptées. Éviter de charger toutes les demandes dans le navigateur pour effectuer les calculs.

Si un historique fiable est nécessaire mais absent, proposer une évolution du modèle de données avant de la réaliser.

## 6. Sécurité et autorisations

Le dashboard est réservé au Super Admin.

- Vérifier l'identité et le rôle côté serveur pour chaque endpoint protégé.
- Ne pas se fier uniquement à un menu masqué dans React.
- Refuser les accès non autorisés.
- Appliquer le principe du moindre privilège.
- Ne retourner que les données nécessaires à chaque écran.
- Protéger les informations personnelles et les métadonnées des communications.
- Respecter les règles existantes de validation des entrées et de gestion des erreurs.

Ne jamais exposer des secrets, jetons d'authentification ou données sensibles dans les journaux, les réponses API ou le code frontend.

## 7. Interface utilisateur

Créer une interface professionnelle, claire et responsive, cohérente avec le design existant.

Prévoir, si pertinent :

- Des cartes de synthèse.
- Des graphiques de répartition par statut.
- Une évolution des demandes au fil du temps.
- Des tableaux filtrables et paginés.
- Des alertes sur les échéances dépassées.
- Une vue des dernières activités.
- Des états de chargement, d'erreur et d'absence de données.
- Une navigation vers les détails des demandes.

Privilégier une bibliothèque de graphiques déjà installée. Si aucune n'existe, évaluer Recharts avant de l'ajouter.

Réutiliser les composants UI existants. Ne pas installer de nouvelles dépendances sans expliquer leur utilité et vérifier leur compatibilité.

## 8. Temps réel

Inspecter le système de notifications et de messagerie existant.

S'il utilise déjà WebSocket ou Socket.IO, étudier la possibilité de réutiliser ce mécanisme pour actualiser les indicateurs.

Sinon, comparer les solutions adaptées au besoin réel :
- Actualisation périodique.
- Server-Sent Events.
- WebSocket.

Ne pas introduire une seconde infrastructure temps réel si le mécanisme existant répond déjà au besoin.

Prévoir une actualisation cohérente des statistiques après les événements pertinents, sans dupliquer les demandes ni compter plusieurs fois une même transition.

## 9. Tests obligatoires

Prévoir des tests adaptés au projet :

### Tests métier
- Chaque demande appartient au bon statut.
- Les transitions de statut ne provoquent pas de double comptage.
- Les demandes urgentes respectent la définition du délai.
- Les demandes en retard sont identifiées correctement.
- Les moyennes excluent ou incluent les données selon une règle explicitée.
- Les filtres et les périodes produisent des résultats cohérents.

### Tests de sécurité
- Le Super Admin autorisé peut consulter le dashboard.
- Un employé ordinaire ne peut pas accéder aux endpoints administratifs.
- Un utilisateur non authentifié est refusé.
- Les données privées ne sont pas renvoyées sans autorisation.

### Tests d'interface et d'intégration
- Les cartes affichent les données de l'API.
- Les filtres fonctionnent.
- Les états de chargement et d'erreur sont gérés.
- Les changements de données actualisent correctement les indicateurs.
- Les fonctionnalités existantes restent opérationnelles.

Utiliser les outils de test déjà présents dans le projet avant d'en ajouter d'autres.

## 10. Format du compte rendu

En mode analyse, fournir :

1. Résumé de l'architecture observée.
2. Fichiers et modules concernés.
3. Données disponibles et manquantes.
4. Définition des indicateurs et règles métier.
5. Proposition d'interface.
6. Proposition d'API et d'actualisation.
7. Risques de sécurité et de performance.
8. Plan d'implémentation par étapes.
9. Plan de tests.
10. Questions bloquantes et décisions attendues.

En mode implémentation, fournir :

1. Modifications réalisées.
2. Fichiers créés ou modifiés.
3. Fonctionnalités implémentées.
4. Tests réellement exécutés et résultats.
5. Points non terminés et risques restants.

Toujours privilégier une solution simple, maintenable, sécurisée et adaptée à l'architecture existante.
