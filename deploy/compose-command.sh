# Commande Docker Compose de la production, commune à deploy.sh et backup/restore.sh (à charger avec « source »,
# depuis la racine du dépôt) : définit le tableau COMPOSE.
#
# COMPOSE_OVERRIDE_FILE (deploy/.env, ou le shell, qui l'emporte) : fichier compose complémentaire facultatif, par
# exemple deploy/docker-compose.school.yml. Sans lui, Compose recréerait Caddy sans le profil du serveur d'école
# (certificat DNS-01, tunnel des parents) : il doit accompagner toute commande qui démarre des conteneurs.

source deploy/env-file.sh

# Docker Compose préfère une variable exportée par le shell à celle de deploy/.env : le signaler (sans les valeurs).
overridden=''
while read -r name; do
  if exported="$(printenv "${name}")" && [ "${exported}" != "$(env_value "${name}")" ]; then
    overridden="${overridden} ${name}"
  fi
done < <(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*[=:].*/\2/p' deploy/.env | sort -u)
if [ -n "${overridden}" ]; then
  echo "ATTENTION : le shell remplace des valeurs de deploy/.env :${overridden}" >&2
fi

COMPOSE_OVERRIDE_FILE="${COMPOSE_OVERRIDE_FILE:-$(env_value COMPOSE_OVERRIDE_FILE)}"

COMPOSE=(docker compose -f deploy/docker-compose.yml)
if [ -n "${COMPOSE_OVERRIDE_FILE}" ]; then
  [ -f "${COMPOSE_OVERRIDE_FILE}" ] || { echo "COMPOSE_OVERRIDE_FILE introuvable : ${COMPOSE_OVERRIDE_FILE}" >&2; exit 1; }
  COMPOSE+=(-f "${COMPOSE_OVERRIDE_FILE}")
fi
COMPOSE+=(--env-file deploy/.env)
