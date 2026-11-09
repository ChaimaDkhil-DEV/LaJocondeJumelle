import { SetMetadata } from '@nestjs/common';

export const PARENT_ALLOWED = 'parentAllowed';

/**
 * Route ouverte aux comptes parents (rôle PARENT, spec 015). Refus par défaut : un compte parent
 * n'atteint que l'authentification, sa cloche, le téléchargement des fichiers qu'il a le droit de
 * lire et ses « Messages de l'école » ; toute autre route répond 403 et le refus est journalisé.
 */
export const ParentAllowed = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PARENT_ALLOWED, true);
