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

FROM caddy:2
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
