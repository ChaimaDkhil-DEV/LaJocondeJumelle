# Vérification — assistance sans abonnement (règles, Whisper local)

Branche `011-assistance-regles-whisper-local`, créée depuis `master` (`cac29f1`, fusion de #42).
Spécification : `specs/010-assistance-fournisseurs-similaires/` (US5, US6, FR-013 à FR-017,
research R9 à R11, tâches T020 à T027).

## Résultats du 29/10/2026 (exécutés)

| Étape | Commande | Résultat |
|-------|----------|----------|
| Lint | `npm run lint` | sans erreur |
| Typages | `npm run -w backend typecheck`, `npm run -w frontend typecheck` | sans erreur |
| Unitaires backend | `npm test -w backend` | 688 / 688 (39 suites) |
| Intégration backend | `npm run -w backend test:integration` | 694 réussis, 1 ignoré (test réel Whisper, sans `ASSIST_WHISPER_TEST_URL`) |
| Frontend | `npm test -w frontend` | 328 / 328 |
| E2E assistance | `assist.spec.ts` (chromium, mobile-320) | 6 / 6 |
| Dépendances | `npm audit --audit-level=high` | 16 vulnérabilités, 4 « high » antérieures (`multer`, `body-parser`, `undici`), aucune nouvelle |
| Compose (syntaxe) | analyse YAML (Node) | valide ; `whisper` sans port publié en production, `127.0.0.1:8000` en développement ; ports publiés de Caddy inchangés (80, 443) |

## Image Whisper retenue

`ghcr.io/speaches-ai/speaches:0.8.3-cpu@sha256:21e3df06d842fb7802ab470dd77c25f0e8c0d22950e8d8c6ae886e851af53ef8`
(dernière version stable publiée ; étiquette et empreinte lues sur le registre GHCR le 29/10/2026).

## Limites existantes documentées

- Durée d'un vocal : `voiceMaxSeconds` 180 s par défaut (10 à 600 s, réglage), tolérance de 2 s ;
  taille `voiceMaxBytes` ; plafond technique d'envoi 25 Mo. Non modifiés.
- Délais : propositions `ASSIST_TIMEOUT_MS` (15 s, 20 s au plus) ; transcription
  `ASSIST_TRANSCRIPTION_TIMEOUT_MS` (120 s par défaut, **provisoire**, 300 s au plus) ; Node
  `requestTimeout` 300 s (réception de la requête) ; aucun délai côté navigateur ni Caddy.
- Limite d'appels : 10 par 5 minutes et par utilisateur (transcription et propositions réunies).

## Docker et Caddy (exécutés le 29/10/2026)

Docker 29.9.2, Compose v5.6.1 ; machine virtuelle Docker : 4 processeurs, 5,7 Go.

| Vérification | Résultat |
|--------------|----------|
| `docker compose -f deploy/docker-compose.dev.yml config` | valide |
| `docker compose -f deploy/docker-compose.yml --profile whisper config` (secrets fictifs) | valide ; seuls 80 et 443 publiés, `whisper` sans port publié, API vers `https://caddy:8444` |
| `caddy validate` sur `deploy/Caddyfile` (image `caddy:2`) | « Valid configuration » |
| Téléchargement du modèle : `POST /v1/models/Systran/faster-whisper-small` | confirmé : HTTP 200 en 331 s, 464 Mo dans le volume des modèles |

## T026 — mesure réelle (exécutée le 29/10/2026)

Serveur `whisper` de `docker-compose.dev.yml` (`127.0.0.1:8000`), modèle
`Systran/faster-whisper-small`, processeur seul (Intel N95), mêmes champs que le connecteur
(`language=fr`, `response_format=json`). Audio de synthèse vocale Windows (voix Hortense), textes
fictifs, sans donnée personnelle.

| Audio | Durée de transcription |
|-------|------------------------|
| Phrase de 4,5 s, premier appel (test `assist-whisper-live.spec.ts`, par l'API) | 43,1 s (chargement du modèle compris) |
| Phrase de 4,5 s, modèle chargé (3 essais) | 7,5 à 8,7 s |
| Vocal de 179,5 s, modèle chargé (2 essais) | 136,8 et 159,5 s |

- Test réel `assist-whisper-live.spec.ts` : réussi, texte exact (« La photocopieuse du premier
  étage est en panne depuis ce matin. »), aucun fichier conservé.
- Qualité sur le vocal de 179,5 s : environ 4 % d'erreurs sur les mots (379 mots), surtout des
  homophones (« raid chaussée », « salle douce », « late »).
- Le vocal de 179,5 s (texte et audio) reste hors dépôt.
- **Conséquence** : un vocal de 180 s dépasse le délai par défaut de 120 s
  (`ASSIST_TRANSCRIPTION_TIMEOUT_MS`) sur ce poste ; la valeur par défaut est à relever.

## En attente

- Relais HTTPS interne et certificat de l'autorité interne, pile de production complète.
- Valeur par défaut d'`ASSIST_TRANSCRIPTION_TIMEOUT_MS` à fixer d'après la mesure ci-dessus.
