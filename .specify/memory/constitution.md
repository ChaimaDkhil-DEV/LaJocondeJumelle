# Constitution de LaJocondeJumelle

## Core Principles

### I. Développement piloté par les tests (NON NÉGOCIABLE)

- Tout comportement nouveau ou modifié DOIT d'abord être décrit par un test automatisé qui
  échoue, avant d'écrire le code d'implémentation (cycle Rouge → Vert → Refactorisation).
- Chaque user story DOIT avoir des tests d'acceptation traçables vers ses critères
  d'acceptation dans la spécification.
- Les règles métier (statuts, transitions, droits d'accès) DOIVENT être couvertes par des tests
  unitaires ; les parcours utilisateur critiques DOIVENT être couverts par des tests
  d'intégration ou de bout en bout.
- Aucune modification ne peut être fusionnée si la suite de tests échoue.

**Justification** : les tests écrits en premier fixent le comportement attendu et protègent
les règles administratives contre les régressions silencieuses.

### II. Simplicité / YAGNI

- Chaque fonctionnalité DOIT être implémentée avec la solution la plus simple qui satisfait
  les exigences actuelles de la spécification.
- Aucune abstraction, dépendance, couche ou option de configuration ne DOIT être ajoutée pour
  un besoin hypothétique futur.
- Toute complexité supplémentaire (nouveau service, nouvelle dépendance majeure, nouveau
  pattern architectural) DOIT être justifiée par écrit dans la section « Complexity Tracking »
  du plan, avec l'alternative plus simple rejetée et la raison du rejet.

**Justification** : un code simple est plus facile à tester, à sécuriser et à faire évoluer.

### III. Accessibilité et qualité UX

- Toute interface utilisateur DOIT respecter les WCAG 2.2 niveau AA : navigation complète au
  clavier, contrastes suffisants, libellés explicites pour les champs de formulaire, focus
  visible et sémantique HTML correcte.
- L'interface DOIT être responsive et utilisable de 320 px de large jusqu'aux écrans de bureau,
  sans défilement horizontal.
- Les composants, libellés, messages d'erreur et états (chargement, vide, erreur, succès)
  DOIVENT être cohérents dans toute l'application.
- Les messages d'erreur DOIVENT indiquer clairement le problème et l'action corrective possible.
- Des vérifications d'accessibilité automatisées DOIVENT faire partie de la suite de tests des
  écrans livrés.

**Justification** : une application administrative doit être utilisable par tous les agents
et usagers, y compris ceux en situation de handicap.

### IV. Sécurité et protection des données

- Toutes les entrées (formulaires, paramètres d'URL, API, fichiers téléversés) DOIVENT être
  validées et assainies côté serveur ; la validation côté client ne suffit jamais.
- Aucun secret (mot de passe, clé d'API, jeton) ne DOIT figurer dans le code source ni dans
  l'historique du dépôt ; les secrets DOIVENT provenir de la configuration d'environnement ou
  d'un gestionnaire de secrets.
- Seules les données personnelles strictement nécessaires à une fonctionnalité DOIVENT être
  collectées (minimisation, conformément au RGPD) ; leur finalité et leur durée de
  conservation DOIVENT être documentées dans la spécification concernée.
- Les échanges DOIVENT être chiffrés en transit (HTTPS), et les mots de passe DOIVENT être
  stockés avec un algorithme de hachage adapté (par ex. Argon2 ou bcrypt).
- Les dépendances présentant des vulnérabilités connues de sévérité élevée ou critique ne
  DOIVENT pas être livrées en production.

**Justification** : l'application traite des demandes administratives et des communications
internes dont la fuite ou l'altération aurait des conséquences graves.

### V. Intégrité des workflows administratifs et des communications

- Chaque demande administrative DOIT avoir un statut explicite, issu d'un ensemble fini et
  documenté, et ne peut changer de statut que par des transitions autorisées et définies.
- Chaque création, modification ou changement de statut d'une demande DOIT être tracé dans un
  journal d'audit non modifiable par les utilisateurs (auteur, date et heure, action, valeurs
  avant et après).
- L'accès aux demandes et aux actions DOIT être contrôlé par rôle (RBAC) ; les autorisations
  DOIVENT être vérifiées côté serveur pour chaque requête, selon le principe du moindre
  privilège.
- Les communications internes DOIVENT être organisées (par fil, demande ou canal) et
  consultables par les utilisateurs autorisés, et DOIVENT être protégées contre tout accès,
  modification ou suppression non autorisés.
- Tout refus d'accès DOIT être journalisé et ne DOIT pas révéler l'existence de ressources
  auxquelles l'utilisateur n'a pas droit.

**Justification** : la confiance dans le traitement administratif repose sur la clarté des
statuts, la traçabilité des actions et la confidentialité des échanges.

## Contraintes techniques et de sécurité

- La pile technique (frameworks, base de données, hébergement) est choisie dans le plan
  d'implémentation de chaque fonctionnalité, conformément aux principes II et IV ; tout écart
  avec la pile existante DOIT être justifié.
- L'authentification DOIT être obligatoire pour toute fonctionnalité non publique, et les
  sessions DOIVENT expirer après une période d'inactivité définie.
- Les journaux d'application et d'audit NE DOIVENT PAS contenir de secrets ni de données
  personnelles sensibles en clair.
- Les modèles de données des demandes, des rôles et des communications DOIVENT être documentés
  (`data-model.md`) avant implémentation.

## Workflow de développement et contrôles qualité

- Chaque fonctionnalité suit le cycle Spec Kit : spécification → clarification → plan →
  tâches → implémentation.
- Le plan DOIT inclure un « Constitution Check » vérifiant la conformité aux cinq principes
  avant la phase de conception, puis à nouveau après celle-ci.
- Toute modification DOIT passer une revue de code qui vérifie : tests écrits en premier et au
  vert, absence de complexité injustifiée, accessibilité, sécurité (validation, secrets,
  autorisations), traçabilité des actions administratives.
- Une fonctionnalité n'est considérée comme terminée que si ses critères d'acceptation sont
  couverts par des tests passants et que les vérifications d'accessibilité et de dépendances
  sont au vert.

## Governance

- Cette constitution prévaut sur toute autre pratique ou convention du projet. En cas de
  conflit, la constitution s'applique.
- Toute modification de la constitution DOIT être proposée par écrit, avec la justification,
  l'impact sur les spécifications et plans existants et, si nécessaire, un plan de migration.
- Versionnage sémantique de la constitution :
  - MAJEUR : suppression ou redéfinition incompatible d'un principe ou d'une règle de
    gouvernance ;
  - MINEUR : ajout d'un principe ou d'une section, ou extension substantielle des règles ;
  - CORRECTIF : clarifications, reformulations, corrections sans effet sur le fond.
- La conformité est vérifiée à chaque plan (Constitution Check) et à chaque revue de code ;
  toute dérogation DOIT être documentée et justifiée dans le plan concerné.
- Une revue de la constitution est recommandée à chaque version majeure de l'application.

**Version**: 1.0.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
