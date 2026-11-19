# syntax=docker/dockerfile:1
# Image des services « backup » et « n8n-backup » : outils PostgreSQL 17 et age, pour chiffrer les
# sauvegardes avec la clé publique BACKUP_AGE_RECIPIENT (audit de sécurité R03).
FROM postgres:17
RUN apt-get update \
  && apt-get install -y --no-install-recommends age \
  && rm -rf /var/lib/apt/lists/*
