-- 015 : la surveillante générale (rôle ADMIN) valide les communications aux parents, comme le super
-- administrateur. Migration de données seule : accorde la permission au rôle ADMIN sur les bases
-- existantes (les nouvelles la reçoivent par les permissions par défaut). Sans effet si elle est déjà
-- accordée. Le super administrateur peut la retirer ensuite dans « Réglages › Permissions par rôle ».
INSERT INTO "RolePermission" ("role", "permission")
VALUES ('ADMIN', 'PARENT_COMMUNICATION_VALIDATE')
ON CONFLICT DO NOTHING;
