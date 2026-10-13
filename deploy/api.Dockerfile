# syntax=docker/dockerfile:1
# Image de l'API (NestJS + ffmpeg). Contexte de construction : racine du dépôt.
#   docker build -f deploy/api.Dockerfile -t ljj-api .

# --- Construction : dépendances complètes, client Prisma, compilation TypeScript ---
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --no-audit --no-fund
COPY backend/ backend/
RUN npm run -w backend prisma:generate && npm run -w backend build

# --- Exécution : dépendances de production seulement, utilisateur non root ---
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    FILES_DIR=/data/files \
    FFMPEG_PATH=ffmpeg \
    FFPROBE_PATH=ffprobe \
    PORT=3000
# ffmpeg/ffprobe : contrôle et conversion des vocaux en AAC/MP4 (research R2) ;
# openssl : requis par le moteur Prisma.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --omit=dev --no-audit --no-fund && npm cache clean --force
COPY backend/prisma backend/prisma
RUN npm run -w backend prisma:generate
COPY --from=build /app/backend/dist backend/dist
COPY deploy/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod 0755 /usr/local/bin/api-entrypoint.sh \
 && mkdir -p /data/files \
 && chown -R node:node /data
USER node
WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
