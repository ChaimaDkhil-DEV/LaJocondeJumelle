# Contrat REST — 005 Page « Mon profil »

Aucune route nouvelle. Une réponse existante gagne deux champs ; une route est réutilisée telle
quelle.

## `GET /api/auth/me` (et réponse de `POST /api/auth/login`) — champs ajoutés

Session requise (`SessionGuard` global) ; renvoie **uniquement** le compte de la session.

```jsonc
{
  "id": "uuid",
  "username": "enseignante",          // AJOUTÉ : identifiant de connexion
  "displayName": "Enseignante",
  "jobTitle": "Professeure des écoles", // AJOUTÉ : fonction, ou null si non renseignée
  "role": "EMPLOYEE",                   // EMPLOYEE | ADMIN | SUPER_ADMIN
  "permissions": ["REQUEST_CREATE"],
  "mustChangePassword": false,
  "isTeacher": true,
  "isSupervisor": false
}
```

| Code | Cas |
|------|-----|
| 200 | session valide |
| 401 | pas de session ou session expirée (inchangé) |

Compatibilité : ajout de champs seulement ; aucun champ retiré ou renommé.

## `POST /api/auth/password` — inchangé

Corps : `{ "currentPassword": string, "newPassword": string (12 caractères au moins) }`.

| Code | Cas |
|------|-----|
| 204 | mot de passe changé ; `mustChangePassword` → `false` ; **autres sessions supprimées**, session courante conservée ; audit `PASSWORD_CHANGED` |
| 400 `VALIDATION_ERROR` | `currentPassword` : « Mot de passe actuel incorrect. » ; `newPassword` : « Le nouveau mot de passe doit contenir au moins 12 caractères. » |
| 401 | pas de session |
