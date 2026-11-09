import { applyDecorators, SetMetadata } from '@nestjs/common';
import { Public } from './public.decorator';

export const INTEGRATION_ROUTE = 'integrationRoute';

/**
 * Route appelée de serveur à serveur par une automatisation (n8n, spec 015) : sans session ni cookie,
 * donc hors de la protection CSRF par l'en-tête Origin. Elle doit être protégée par son propre garde
 * (secret partagé comparé en temps constant).
 */
export const IntegrationRoute = (): MethodDecorator & ClassDecorator =>
  applyDecorators(Public(), SetMetadata(INTEGRATION_ROUTE, true));
