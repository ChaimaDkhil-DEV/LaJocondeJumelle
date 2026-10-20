# Migration 0002_coverage : couverture de classe

> **Document daté, antérieur à la fonctionnalité 004** : le rôle « Responsable » (`MANAGER`) y est
> devenu « Admin » (`ADMIN`) et la diffusion des gardes a été remplacée par l'assignation par l'admin.
> Voir `specs/004-retards-affectation-surveillants/` (migration : `contracts/migration.md`).

Cette migration ajoute le module de couverture de classe (garde ou remplacement).

## Contenu

Elle est **additive** : aucune table ni colonne existante n'est supprimée ou renommée.

- **Énumérations existantes** : de nouvelles valeurs sont ajoutées.
  - `RequestStatus` : `BROADCAST`, `UNFILLED`, `EN_ROUTE`, `LATE`, `ON_DUTY`, `RELIEF_PENDING`.
  - `DeadlineStage` : `ARRIVAL`.
  - `RequestEventType`, `AuditAction` et `NotificationType` : valeurs propres au module.
- **Nouvelles colonnes**, avec une valeur par défaut pour les données existantes :
  - `Request.kind` (`WORK` par défaut) ;
  - `Category.kind` (`WORK`) et `Category.proofMode` (`PHOTO`) ;
  - `DeadlineRule.arrivalMinutes` (vide) ;
  - `User.availability` (`AVAILABLE`).
- **Nouvelles tables** : `SchoolClass`, `EmployeeGroup`, `EmployeeGroupMember`, `CoverageDetail`, `CoverageTarget`, `CoveragePresence`.
- **Données par défaut**, toutes modifiables ensuite depuis l'administration :
  - catégorie « Garde de classe » :
    - preuve exigée : QR code et photo ;
    - délais : prise en charge 2 min, arrivée en classe 5 min ;
    - pas de validation finale ;
    - créée par les responsables ;
    - responsables : les comptes MANAGER actifs au moment de la migration ;
  - groupe « Surveillants/Remplaçants », vide.

Aucune demande de travail existante n'est modifiée : toutes prennent `kind = WORK`.

## Sauvegarde et exécution

En production, lancez la mise à jour depuis la racine du dépôt :

```bash
deploy/deploy.sh
```

Le script sauvegarde la base **et** les fichiers, puis reconstruit et redémarre les conteneurs ; au démarrage, l'API applique `prisma migrate deploy` (`deploy/api-entrypoint.sh`). Si la sauvegarde échoue, rien n'est mis à jour.

Notez l'horodatage affiché par la sauvegarde (par exemple `[backup] terminé : db-20261013T173000Z.dump files-20261013T173000Z.tar.gz`), puis vérifiez que les deux fichiers sont bien présents dans le dossier des sauvegardes : c'est elle qu'il faudra restaurer en cas de problème.

L'API refuse d'appliquer une migration sans sauvegarde de moins de `PRE_MIGRATION_BACKUP_MAX_AGE_MINUTES` minutes (60 par défaut) : un `docker compose … up` lancé sans le script s'arrête avec « Migration en attente sans sauvegarde récente : lancez deploy/deploy.sh. », sans toucher la base.

En développement, ou pour appliquer explicitement :

```bash
npm run -w backend prisma:deploy     # = prisma migrate deploy
npm run -w backend prisma:generate   # client Prisma à jour
```

Pour vérifier que la base correspond exactement au schéma :

```bash
cd backend && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

La commande doit répondre « No difference detected ».

Cas particulier d'une base neuve : la migration s'exécute avant que les comptes existent, et la catégorie « Garde de classe » n'a donc aucun responsable. Ajoutez-les dans Administration › Catégories. Le super administrateur a toujours tous les droits.

## Retour arrière

### Cas général : restaurer la sauvegarde

C'est la méthode recommandée dès que le module a servi :

```bash
deploy/backup/restore.sh <horodatage de la sauvegarde prise avant la migration>
```

Redéployez ensuite la version précédente de l'application.

### Base où le module n'a jamais servi : script inverse

Utilisez `prisma/migrations/0002_coverage/down.sql` :

```bash
cd backend
npx prisma db execute --file prisma/migrations/0002_coverage/down.sql --schema prisma/schema.prisma
```

Redéployez ensuite la version précédente de l'application. Le script :

- **s'arrête sans rien modifier** si une donnée du module existe, que ce soit une demande de couverture, un historique, une notification ou une entrée du journal d'audit. L'historique et le journal sont en ajout seul et ne doivent jamais être réécrits : dans ce cas, restaurez la sauvegarde ;
- sinon :
  - supprime les tables et colonnes ajoutées ;
  - recrée les énumérations avec leurs valeurs d'origine ;
  - retire la ligne `0002_coverage` de `_prisma_migrations`, ce qui permet de réappliquer la migration plus tard avec `prisma migrate deploy`.

L'enchaînement up → down → up a été vérifié sur une base jetable : après chaque étape, `prisma migrate diff` ne détecte aucune différence avec le schéma attendu.

## Clé des QR codes

Les QR codes des classes sont signés avec une clé dérivée de `SESSION_SECRET`. Changer `SESSION_SECRET` invalide tous les QR imprimés : il faut alors les réimprimer depuis Administration › Classes.
