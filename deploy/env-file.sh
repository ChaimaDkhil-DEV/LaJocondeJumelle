# Lecture d'une variable de deploy/.env par les scripts (à charger avec « source »), avec le même sens que Docker
# Compose : guillemets retirés, commentaire précédé d'une espace ignoré, dernière affectation retenue, fins de ligne
# Windows acceptées. Le fichier n'est jamais exécuté ; ${VARIABLE} n'y est pas remplacée.
#
#   env_value NOM [fichier, deploy/.env par défaut]

env_value() {
  local raw
  raw="$(sed -nE "s/^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*[=:][[:space:]]*//p" "${2:-deploy/.env}" | tail -n 1)"
  raw="${raw%$'\r'}"
  case "${raw}" in
    \"*\"*)
      raw="${raw#\"}"
      raw="${raw%%\"*}"
      ;;
    \'*\'*)
      raw="${raw#\'}"
      raw="${raw%%\'*}"
      ;;
    *)
      raw="${raw%% \#*}"
      raw="${raw%"${raw##*[![:space:]]}"}"
      ;;
  esac
  printf '%s' "${raw}"
}
