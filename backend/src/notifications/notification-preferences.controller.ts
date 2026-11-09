import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UpdateNotificationPreferencesDto } from './notification-preferences.dto';
import { NotificationPreferencesService, type NotificationPreferencesView } from './notification-preferences.service';

/**
 * Préférences de notification de l'utilisateur connecté (spec 014, FR-009, FR-018). Aucun identifiant
 * dans l'adresse : chacun ne lit et ne modifie que les siennes. Utilisables même si le push est désactivé.
 */
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPreferencesView> {
    return this.preferences.get(user.id);
  }

  @Patch()
  patch(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateNotificationPreferencesDto): Promise<NotificationPreferencesView> {
    return this.preferences.patch(user.id, dto);
  }
}
