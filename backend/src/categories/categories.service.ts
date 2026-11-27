import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { isCoverageAdmin } from '../coverage/domain/coverage-policy';
import { canCreateInCategory } from '../requests/domain/access-policy';
import { RequestPolicyLoader, toPolicyCategory } from '../requests/request-policy.loader';
import type { CategoryOption, RecipientOption } from './categories.controller';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CategoriesService {
  constructor(private readonly policies: RequestPolicyLoader) {}

  /**
   * Catégories actives proposées dans « Nouvelle demande ». Travail : création possible
   * (canCreateInCategory). Garde : capacité de création du module Gardes (isCoverageAdmin, celle de
   * POST /api/coverage), indépendante de REQUEST_CREATE et des rôles créateurs ; le formulaire n'y crée
   * rien, il renvoie vers « Nouvelle affectation ».
   */
  async creatableCategories(user: AuthenticatedUser): Promise<CategoryOption[]> {
    const categories = await this.policies.categories({ active: true });
    return categories
      .filter((category) =>
        category.kind === 'COVERAGE' ? isCoverageAdmin(user) : canCreateInCategory(user, toPolicyCategory(category)),
      )
      .map((c) => ({ id: c.id, name: c.name, circuit: c.circuit, routingMode: c.routingMode, photoRequired: c.photoRequired, kind: c.kind }));
  }

  async recipients(user: AuthenticatedUser, categoryId: string): Promise<RecipientOption[]> {
    const category = UUID.test(categoryId) ? await this.policies.category(categoryId) : null;
    if (!category || category.kind !== 'WORK' || !canCreateInCategory(user, toPolicyCategory(category))) {
      throw new AppException('NOT_FOUND');
    }
    // Entre enseignants : on n'écrit pas à soi-même (règle portée par le chargeur).
    return this.policies.recipients(category, user.id);
  }
}
