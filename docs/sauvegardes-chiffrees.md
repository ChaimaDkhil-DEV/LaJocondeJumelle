# Sauvegardes chiffrées

Audit de sécurité du 2026-11-18, point R03. Les sauvegardes contiennent toute la base (comptes, demandes,
communications avec les parents) et tous les fichiers (vocaux, photos, documents). Elles sont chiffrées
avec [age](https://age-encryption.org) :

- le serveur ne détient que la **clé publique** (`BACKUP_AGE_RECIPIENT`), qui sert à chiffrer ;
- la **clé privée**, qui sert à restaurer, ne va **jamais** sur le serveur ni dans le dossier hors serveur ;
- celui qui obtient les sauvegardes (vol du disque, du NAS, accès au partage) ne peut pas les lire.

Toutes les sauvegardes sont concernées : copie locale (`BACKUP_DIR`), copie hors serveur
(`BACKUP_OFFSITE_DIR`) et sauvegardes de n8n (sous-dossier `n8n`). Les archives se nomment
`db-<horodatage>.dump.age` et `files-<horodatage>.tar.gz.age`.

**Sans clé publique valide, aucune sauvegarde n'est faite** (jamais en clair) : la sauvegarde nocturne
échoue (alerte de `check-backup.sh`) et `deploy/deploy.sh` s'arrête avant de toucher aux conteneurs.

> **Perdre la clé privée, c'est perdre toutes les sauvegardes.** Gardez-en deux copies, à deux endroits.

## 1. Générer la paire de clés (une fois, hors du serveur)

Sur l'ordinateur de la personne responsable, pas sur le serveur, installez age :
`winget install FiloSottile.age` (Windows), `brew install age` (macOS) ou `sudo apt install age`
(Debian, Ubuntu). Puis :

```text
age-keygen -o cle-sauvegardes-ljj.txt
```

La commande affiche la clé publique (`Public key: age1…`), également écrite en commentaire dans le
fichier. Retrouver la clé publique plus tard : `age-keygen -y cle-sauvegardes-ljj.txt`.

## 2. Conserver la clé privée

- Deux copies hors ligne, à deux endroits : par exemple un gestionnaire de mots de passe de
  l'établissement et une clé USB dans le coffre de la direction.
- Jamais sur le serveur, dans le dépôt, dans `deploy/.env`, ni dans le dossier `BACKUP_OFFSITE_DIR`.
- Conseillé : une seconde paire de clés pour une autre personne (par exemple le prestataire
  informatique). Les deux clés publiques se mettent ensemble, séparées par une virgule ; chacune des
  deux clés privées suffit alors pour restaurer.

## 3. Configurer le serveur

Dans `deploy/.env` :

```text
BACKUP_AGE_RECIPIENT=age1…              # ou : age1…(direction),age1…(prestataire)
```

Puis `deploy/deploy.sh`.
Le script reconstruit l'image de sauvegarde (`deploy/backup.Dockerfile` : `postgres:17` et age), fait
une sauvegarde chiffrée, puis met à jour l'application. Le journal doit se terminer par
`[backup] terminé : db-….dump.age files-….tar.gz.age`.

## 4. Serveur déjà en service (mise à jour)

1. Avant la mise à jour : générer la paire de clés (section 1) et ajouter `BACKUP_AGE_RECIPIENT` dans
   `deploy/.env`. Sans cela, `deploy.sh` s'arrête sur « ÉCHEC de la sauvegarde : aucun conteneur
   modifié » ; l'application continue de tourner sur l'ancienne version.
2. Lancer `deploy/deploy.sh`, puis vérifier le dossier `deploy/backups` : de nouvelles archives `.age`.
3. Les anciennes sauvegardes en clair disparaissent d'elles-mêmes au bout de `BACKUP_RETENTION_DAYS`
   jours (14 par défaut). Elles restent restaurables sans clé jusque-là. Pour les supprimer tout de
   suite, une fois la première sauvegarde chiffrée réussie, dans `BACKUP_DIR`, `BACKUP_DIR/n8n`, et
   dans le dossier hors serveur et son sous-dossier `n8n` :

   ```text
   find deploy/backups deploy/backups/n8n -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -print -delete
   ```

4. Une migration n'est appliquée avant le démarrage de l'API qu'après une sauvegarde **chiffrée** récente
   (`db-*.dump.age`, `deploy/migrate-entrypoint.sh`, service `migrate`).

## 5. Restaurer

1. Copier la clé privée sur le serveur, le temps de la restauration seulement (par exemple
   `scp cle-sauvegardes-ljj.txt serveur:/tmp/`).
2. Depuis la racine du dépôt :

   ```text
   deploy/backup/restore.sh <horodatage> /tmp/cle-sauvegardes-ljj.txt
   ```

   Les deux archives sont d'abord déchiffrées et vérifiées : avec une mauvaise clé ou une archive
   abîmée, le script s'arrête sans rien modifier. Ensuite seulement il demande de taper `RESTAURER`,
   arrête l'application, restaure la base puis les fichiers, et redémarre. Le contenu déchiffré ne
   passe que par des conteneurs éphémères, jamais par un fichier en clair sur l'hôte.
3. Retirer la clé du serveur : `shred -u /tmp/cle-sauvegardes-ljj.txt`.

Une ancienne archive en clair (antérieure au chiffrement) se restaure sans clé :
`deploy/backup/restore.sh <horodatage>`.

**n8n** : déchiffrer d'abord, puis suivre `docs/parent-communications.md` :
`age -d -i cle.txt -o db.dump db-<horodatage>.dump.age` et
`age -d -i cle.txt files-<horodatage>.tar.gz.age | tar -xz`, sur une machine de confiance.

## 6. Test de restauration (obligatoire)

À la mise en service, puis au moins une fois par trimestre, et après tout changement de clé.

1. Sur une **machine de test**, jamais sur le serveur de production : cloner le dépôt au même commit,
   créer un `deploy/.env` de test, démarrer la base (`docker compose -f deploy/docker-compose.yml
   --env-file deploy/.env up -d db`).
2. Copier les deux archives `.age` les plus récentes de la copie **hors serveur** dans `deploy/backups`.
   On vérifie ainsi la copie dont on aura besoin si le serveur est perdu.
3. Restaurer avec la clé privée, prise depuis l'une de ses deux copies (section 5).
4. Vérifier : connexion, une demande avec son vocal, une photo, le journal d'audit.
5. Consigner dans `docs/validation/` : date, horodatage de la sauvegarde, copie de la clé utilisée,
   résultat. Puis effacer les données de test et la clé de la machine de test.

## 7. Clé perdue ou divulguée

- **Clé privée perdue** (toutes ses copies) : les sauvegardes existantes sont illisibles. Générer
  aussitôt une nouvelle paire, remplacer `BACKUP_AGE_RECIPIENT`, lancer une sauvegarde
  (`docker compose … run --rm --entrypoint /bin/bash backup /scripts/backup.sh`) et faire le test de
  restauration.
- **Clé privée divulguée** : même chose, puis supprimer les sauvegardes chiffrées avec l'ancienne clé,
  localement et hors serveur, dès qu'une sauvegarde avec la nouvelle clé a réussi.

## Vérification (2026-11-18)

Projet Docker isolé, avec l'image `deploy/backup.Dockerfile` (age 1.2.1), une vraie base PostgreSQL 17
et le vrai `restore.sh` :

- sans clé, sauvegarde refusée et aucun fichier écrit ;
- avec clé, deux archives `.age` (en-tête `age-encryption.org/v1`) ;
- restauration avec une autre clé : refus à la vérification, services toujours en marche, aucune
  donnée modifiée ;
- restauration avec la bonne clé après suppression des données : demande et vocal revenus (fichier
  appartenant à `node`), services redémarrés ;
- ancienne archive en clair : restaurée sans clé.
