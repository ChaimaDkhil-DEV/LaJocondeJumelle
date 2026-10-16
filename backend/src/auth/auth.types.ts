import type { Permission, Role } from '@prisma/client';
import type { PolicyUser } from '../common/authorization';

/** Utilisateur authentifié attaché à la requête par SessionGuard. */
export interface AuthenticatedUser extends PolicyUser {
  username: string;
  displayName: string;
  mustChangePassword: boolean;
}

export interface AuthContext {
  user: AuthenticatedUser;
  sessionId: string;
}

/** Profil renvoyé par POST /auth/login et GET /auth/me. */
export interface MeResponse {
  id: string;
  displayName: string;
  role: Role;
  permissions: Permission[];
  mustChangePassword: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export function toMeResponse(user: AuthenticatedUser): MeResponse {
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    permissions: [...user.permissions].sort(),
    mustChangePassword: user.mustChangePassword,
  };
}
