import { Injectable } from '@nestjs/common';
import type { NotificationPreference } from '@prisma/client';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { UpdateNotificationPreferencesDto } from './notification-preferences.dto';

/** Les quatre catégories push (spec 014, D1). */
export const PUSH_CATEGORIES = ['urgent', 'coverage', 'unfilled', 'attendance'] as const;
export type PushCategoryName = (typeof PUSH_CATEGORIES)[number];

export interface NotificationPreferencesView {
  categories: Record<PushCategoryName, boolean>;
  urgentSound: boolean;
  /** false : le son n'a jamais été réglé sur le compte (reprise unique de la valeur locale, NC-6). */
  urgentSoundSet: boolean;
}

/**
 * Préférences de notification d'un utilisateur (spec 014, FR-009, data-model.md). Valeurs par défaut tant
 * que l'utilisateur n'a rien modifié ; modification partielle, champ par champ : la dernière écriture
 * l'emporte (NC-9). Seul l'utilisateur modifie ses préférences (FR-018).
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<NotificationPreferencesView> {
    return this.view(await this.prisma.notificationPreference.findUnique({ where: { userId } }));
  }

  async patch(userId: string, dto: UpdateNotificationPreferencesDto): Promise<NotificationPreferencesView> {
    const data: Partial<Record<PushCategoryName | 'urgentSound', boolean>> = {};
    for (const category of PUSH_CATEGORIES) {
      const value = dto.categories?.[category];
      if (value !== undefined) data[category] = value;
    }
    if (dto.urgentSound !== undefined) data.urgentSound = dto.urgentSound;
    if (Object.keys(data).length === 0) {
      throw new AppException('VALIDATION_ERROR', {
        fields: [{ field: 'categories', messages: ['Indiquez au moins une préférence à modifier.'] }],
      });
    }
    const row = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.view(row);
  }

  private view(row: NotificationPreference | null): NotificationPreferencesView {
    return {
      categories: {
        urgent: row?.urgent ?? true,
        coverage: row?.coverage ?? true,
        unfilled: row?.unfilled ?? true,
        attendance: row?.attendance ?? true,
      },
      urgentSound: row?.urgentSound ?? true,
      urgentSoundSet: row?.urgentSound !== null && row?.urgentSound !== undefined,
    };
  }
}
