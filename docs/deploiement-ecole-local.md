# Déploiement sur un serveur local d'école

Le serveur de l'école héberge tout (application, base, fichiers, sauvegardes). Le domaine est géré par
Cloudflare :

- **HTTPS** : certificat Let's Encrypt obtenu par défi **DNS-01** (aucun accès entrant depuis Internet).
- **Parents** : **Cloudflare Tunnel** (`cloudflared`), sans port ouvert sur le routeur.
- **Personnel** : sur le Wi-Fi de l'école, le DNS interne renvoie directement l'IP du serveur.

Fichiers : `deploy/docker-compose.school.yml`, `deploy/profiles/school/`, `deploy/web.Dockerfile`.
Le déploiement VPS existant n'est pas modifié : le profil Caddy par défaut (`public`) ne change rien.

## 1. Serveur

Ubuntu Server 24.04 LTS, IP fixe, 4 cœurs, 8 Go de RAM minimum, SSD, onduleur. Installer Docker Engine,
le plugin Compose et git. Pare-feu : seul SSH (réseau interne) ; aucun port entrant public n'est requis.
Prévoir un disque ou NAS distinct pour `BACKUP_OFFSITE_DIR`.

## 2. Cloudflare

1. **Jeton d'API (certificat)** : _My Profile → API Tokens → Create Token_, permissions `Zone → DNS → Edit`
   et `Zone → Zone → Read`, limité à la zone de l'école. Valeur de `CF_API_TOKEN`.
2. **Tunnel** : _Zero Trust → Networks → Tunnels → Create a tunnel_ (type Cloudflared). Copier le jeton du
   tunnel dans `CF_TUNNEL_TOKEN`.
3. **Nom d'hôte public** du tunnel : `demandes.ecole.example` (= `DOMAIN`), service `HTTPS` →
   `caddy:443`. Dans _Additional application settings → TLS_, renseigner **Origin Server Name** =
   `demandes.ecole.example` (Caddy présente le certificat de ce nom).
   Cloudflare crée l'enregistrement DNS (CNAME vers le tunnel, proxifié). Ne créez **pas** d'enregistrement
   A vers une IP privée pour ce nom : un nom ne peut pas être à la fois tunnel et IP locale.

## 3. DNS interne (personnel sur le Wi-Fi de l'école)

Sur le routeur ou le serveur DNS de l'école, faire pointer `demandes.ecole.example` vers l'IP locale du
serveur (« DNS override », « enregistrement local »). Le personnel reste alors sur le réseau local, plus
rapide et utilisable si Internet tombe. Le certificat est le même sur les deux chemins.

## 4. Configuration

```text
git clone <dépôt> && cd LaJocondeJumelle
cp deploy/.env.example deploy/.env
```

Renseigner dans `deploy/.env` : `DOMAIN`, `ACME_EMAIL`, `POSTGRES_PASSWORD` et `APP_DB_PASSWORD` (chacun
`openssl rand -hex 32`, voir `docs/roles-base-de-donnees.md`),
`SESSION_SECRET` (`openssl rand -base64 48`, **à conserver hors du serveur** : le perdre invalide les QR
codes imprimés), `SCHOOL_TIMEZONE=Africa/Tunis`, `BACKUP_OFFSITE_DIR`, `BACKUP_AGE_RECIPIENT` (clé publique de chiffrement des
sauvegardes, clé privée gardée hors du serveur : `docs/sauvegardes-chiffrees.md`), `CF_API_TOKEN`, `CF_TUNNEL_TOKEN`.

## 5. Déploiement

```text
COMPOSE_OVERRIDE_FILE=deploy/docker-compose.school.yml deploy/deploy.sh
```

Le script sauvegarde, reconstruit (la première fois, la compilation de Caddy avec le module Cloudflare
prend quelques minutes) et redémarre. Vérifier : `docker compose -f deploy/docker-compose.yml -f
deploy/docker-compose.school.yml --env-file deploy/.env ps` (tous les services démarrés, `api` sain),
puis les journaux de Caddy : le certificat doit être obtenu (`certificate obtained successfully`).
Pour `ps` et `logs`, ajouter le même `-f` complémentaire. `restore.sh` n'en a pas besoin (base de
données et fichiers seulement).

## 6. Vérifications

- Depuis le Wi-Fi de l'école : `https://demandes.ecole.example` s'ouvre sans avertissement.
- Depuis un téléphone en 4G : même adresse, même certificat.
- Micro, caméra et scan de QR fonctionnent (ils exigent HTTPS).
- Un message de test du personnel apparaît chez un parent de test (comptes à supprimer ensuite).
- Dans le journal d'audit, l'adresse IP d'une connexion depuis la 4G est celle du téléphone, pas celle du
  conteneur `cloudflared` (sinon, vérifier `trusted_proxies` et `TRUST_PROXY`).
- Depuis le Wi-Fi de l'école, l'adresse IP du journal d'audit est celle de l'appareil, même s'il envoie un
  en-tête `X-Forwarded-For` : Caddy ne fait confiance qu'à l'adresse fixe de `cloudflared`
  (`CLOUDFLARED_IP`, réseau Docker `tunnel`, audit de sécurité R04). Si le réseau de l'école utilise déjà
  `172.30.255.0/29`, changer ensemble `TUNNEL_SUBNET`, `TUNNEL_IP_RANGE` et `CLOUDFLARED_IP` (dans le
  sous-réseau, hors de la plage automatique) : voir `deploy/.env.example`.

## 7. Points d'attention

- **Cloudflare voit le trafic en clair** (le HTTPS est terminé chez lui) : accord de la direction et
  mention au registre des traitements. Limite d'envoi gratuite : 100 Mo, supérieure aux 25 Mo de
  l'application.
- **Un seul serveur** : sa panne coupe tout le monde. Sauvegardes hors serveur et test de restauration
  (`deploy/backup/restore.sh`) avant la mise en service.
- **Sans Internet**, les parents perdent l'accès ; le personnel continue grâce au DNS interne.
- Le jeton `CF_API_TOKEN` ne doit pas être commité ; en cas de fuite, le révoquer dans Cloudflare.
- Aucune donnée de démonstration (comptes `parent.*`, `direction`) ne doit exister sur ce serveur.
