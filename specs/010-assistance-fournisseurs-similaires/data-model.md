# Data Model: fournisseurs réels et demandes similaires (010)

Aucune table, colonne, énumération ni migration nouvelle.

## Demande similaire (calculée, jamais conservée)

| Champ | Source | Exposé à l'utilisateur | Transmis au fournisseur |
| --- | --- | --- | --- |
| `id` | `Request.id` | lien seulement | non |
| `reference` | `Request.reference` | oui | non |
| `title` | `Request.title` | oui | oui |
| `categoryName` | `Category.name` | oui | oui |
| `priority` | `Request.priority` | oui | oui |
| `status` | `Request.status` | oui | non |

Règles : `kind = WORK`, `status ≠ DRAFT`, visible selon `visibleRequestsWhere(user)` ; 3 au plus ;
ordre : rang plein texte décroissant, puis `createdAt` décroissant. La description sert à la
recherche mais n'est ni affichée ni transmise.

## Configuration (`AppConfig.assist`, étendue)

| Variable | Valeurs | Défaut | Contrôle au démarrage |
| --- | --- | --- | --- |
| `ASSIST_SUGGESTION_PROVIDER` | `disabled`, `demo`, `claude` | `disabled` | `demo` refusé en production ; `claude` exige `ANTHROPIC_API_KEY` |
| `ASSIST_TRANSCRIPTION_PROVIDER` | `disabled`, `demo`, `whisper` | `disabled` | `demo` refusé en production ; `whisper` exige `ASSIST_WHISPER_URL` |
| `ANTHROPIC_API_KEY` | secret | — | non vide si `claude` ; jamais journalisée |
| `ASSIST_CLAUDE_MODEL` | identifiant de modèle | `claude-opus-5-5` | non vide |
| `ASSIST_WHISPER_URL` | URL | — | `https` en production, `http`/`https` sinon |
| `ASSIST_WHISPER_MODEL` | nom de modèle | `Systran/faster-whisper-small` | non vide |
| `ASSIST_WHISPER_API_KEY` | secret facultatif | — | jamais journalisée |

`ASSIST_TIMEOUT_MS`, `ASSIST_RATE_LIMIT`, `ASSIST_DEMO_TRANSCRIPT` : inchangés (009).
