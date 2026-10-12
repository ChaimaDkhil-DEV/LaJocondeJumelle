import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext, AuthenticatedUser } from './auth.types';

function authOf(context: ExecutionContext): AuthContext {
  const req = context.switchToHttp().getRequest<Request>();
  if (!req.auth) throw new Error('Route sans session : ajoutez la garde ou retirez @CurrentUser()');
  return req.auth;
}

/** Utilisateur authentifié de la requête (posé par SessionGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => authOf(context).user,
);

/** Contexte complet (utilisateur + identifiant de session). */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => authOf(context),
);
