import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { canCreateInCategory } from '../requests/domain/access-policy';
import { RequestPolicyLoader, toPolicyCategory } from '../requests/request-policy.loader';
import type { CategoryOption, RecipientOption } from './categories.controller';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: RequestPolicyLoader,
  ) {}

  async creatableCategories(user: AuthenticatedUser): Promise<CategoryOption[]> {
    // Les catégories de couverture se créent depuis les écrans « Gardes », jamais ici.
    const categories = await this.policies.categories({ active: true, kind: 'WORK' });
    return categories
      .filter((category) => canCreateInCategory(user, toPolicyCategory(category)))
      .map((c) => ({ id: c.id, name: c.name, circuit: c.circuit, photoRequired: c.photoRequired }));
  }

  async recipients(user: AuthenticatedUser, categoryId: string): Promise<RecipientOption[]> {
    const category = UUID.test(categoryId) ? await this.policies.category(categoryId) : null;
    if (!category || category.kind !== 'WORK' || !canCreateInCategory(user, toPolicyCategory(category))) {
      throw new AppException('NOT_FOUND');
    }
    if (category.circuit !== 'A_DIRECT') return [];

    return this.prisma.user.findMany({
      where: { active: true, recipientOf: { some: { categoryId } } },
      select: { id: true, displayName: true, jobTitle: true },
      orderBy: { displayName: 'asc' },
    });
  }
}
