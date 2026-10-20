# LaJocondeJumelle — consignes pour Claude Code

## Migrations Prisma (backend/prisma)

- Après toute modification de `backend/prisma/schema.prisma`, créer la migration **sur la base
  de développement uniquement** (`DATABASE_URL` locale, `localhost:5433`, voir `backend/.env`) :

  ```text
  npm exec -w backend -- prisma migrate dev --name <nom_explicite>
  ```

  puis vérifier :

  ```text
  npm exec -w backend -- prisma migrate status
  ```

  Attendu : « Database schema is up to date! ». Le client Prisma est régénéré par `migrate dev`.
- Ne **jamais** modifier une migration déjà appliquée (dossier présent dans
  `backend/prisma/migrations/` et listé par `migrate status`) : créer une nouvelle migration.
  Une migration modifiée après application casse le contrôle d'intégrité de Prisma en
  développement et en production.
- Écrire chaque `migration.sql` en une seule fois, complète : le hook du projet l'applique dès
  qu'un fichier `backend/prisma/migrations/**/*.sql` est créé ou modifié (voir ci-dessous).
- Si `migrate dev` propose de réinitialiser la base (« reset »), refuser et signaler la dérive :
  ne jamais effacer la base de développement sans accord explicite.
- Jamais `migrate dev`, `migrate reset` ni `db push` contre une autre base que la base locale.
  En production, seul `prisma migrate deploy` s'exécute, via `deploy/api-entrypoint.sh`, après
  une sauvegarde récente.
- Les migrations du projet vont avec un `down.sql` (retour arrière manuel, voir
  `backend/prisma/migrations/0002_coverage/down.sql`).

## Hooks du projet (.claude/settings.json)

- `SessionStart` et `PostToolUse` (sur `backend/prisma/migrations/**/*.sql`) lancent
  `.claude/hooks/apply-migrations.js`, qui exécute `npm run -w backend prisma:deploy` **seulement**
  si la base ciblée est locale (`localhost`, port 5433) et hors `NODE_ENV=production`. Sinon il
  ne fait rien et l'indique. En cas d'échec, il affiche l'erreur et sort avec le code 2.
