import { Controller, Get, Param } from '@nestjs/common';
import type { Circuit } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CategoriesService } from './categories.service';

export interface CategoryOption {
  id: string;
  name: string;
  circuit: Circuit;
  photoRequired: boolean;
}

export interface RecipientOption {
  id: string;
  displayName: string;
  jobTitle: string | null;
}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Catégories actives dans lesquelles l'utilisateur peut créer une demande. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<CategoryOption[]> {
    return this.categories.creatableCategories(user);
  }

  /** Destinataires possibles (circuit A) ; vide en circuit B (le demandeur ne choisit pas l'agent). */
  @Get(':id/recipients')
  recipients(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<RecipientOption[]> {
    return this.categories.recipients(user, id);
  }
}
