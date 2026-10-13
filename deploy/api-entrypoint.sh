#!/bin/sh
# Applique les migrations versionnées puis démarre l'API (research R12).
set -eu
npx --no-install prisma migrate deploy
exec node dist/main.js
