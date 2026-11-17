# syntax=docker/dockerfile:1
# Image web : SPA construite puis servie par Caddy (HTTPS, en-têtes de sécurité, proxy vers l'API).
# Contexte de construction : racine du dépôt.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --no-audit --no-fund
COPY frontend/ frontend/
RUN npm run -w frontend build

# Caddy compilé avec le module DNS Cloudflare (défi DNS-01, profil « school » ; inutilisé en VPS).
FROM caddy:2-builder AS caddy-build
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2
COPY --from=caddy-build /usr/bin/caddy /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/profiles /etc/caddy/profiles
COPY --from=build /app/frontend/dist /srv
