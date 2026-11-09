import { Body, Controller, Delete, Get, Headers, HttpCode, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentAuth } from '../auth/current-user.decorator';
import type { AuthContext } from '../auth/auth.types';
import { UpsertPushSubscriptionDto } from './push.dto';
import { PushSubscriptionsService, type DeviceView, type UpsertResult } from './push-subscriptions.service';

/**
 * Notifications push de l'utilisateur connecté (spec 014, contracts/http-api.md). Session obligatoire
 * (garde globale) ; chacun ne voit et n'enregistre que ses propres appareils (FR-019).
 */
@Controller('push')
export class PushController {
  constructor(private readonly subscriptions: PushSubscriptionsService) {}

  @Get('config')
  config(): { enabled: boolean; publicKey: string | null } {
    return this.subscriptions.publicConfig();
  }

  /** 201 à la création, 200 pour un appareil déjà connu ou transféré depuis un autre compte. */
  @Put('subscriptions')
  async upsert(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpsertPushSubscriptionDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UpsertResult> {
    const result = await this.subscriptions.upsert(auth.user.id, auth.sessionId, dto, userAgent);
    res.status(result.created ? 201 : 200);
    return result;
  }

  @Get('subscriptions')
  list(@CurrentAuth() auth: AuthContext): Promise<DeviceView[]> {
    return this.subscriptions.listForUser(auth.user.id, auth.sessionId);
  }

  /** Abonnement de la session courante (« Désactiver sur cet appareil », avant la déconnexion) : 204 même sans abonnement. */
  @Delete('subscriptions/current')
  @HttpCode(204)
  removeCurrent(@CurrentAuth() auth: AuthContext): Promise<void> {
    return this.subscriptions.deleteForSession(auth.user.id, auth.sessionId);
  }
}
