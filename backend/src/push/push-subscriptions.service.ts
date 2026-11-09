import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { deviceLabel } from './domain/device-label';
import { validatePushSubscription, type PushSubscriptionField } from './domain/push-endpoint';
import type { UpsertPushSubscriptionDto } from './push.dto';

/** Appareils abonnés au plus par utilisateur (research R17). */
export const MAX_DEVICES_PER_USER = 10;
/** La dernière utilisation n'est réécrite qu'au-delà de ce délai (NC-3). */
const TOUCH_INTERVAL_MS = 24 * 3_600_000;

const FIELD_MESSAGES: Record<PushSubscriptionField, string> = {
  endpoint: 'Adresse d’envoi refusée : service de notifications non reconnu.',
  keys: 'Clés d’abonnement invalides.',
};

export interface UpsertResult {
  id: string;
  deviceLabel: string;
  created: boolean;
}

export interface DeviceView {
  id: string;
  deviceLabel: string;
  createdAt: Date;
  lastUsedAt: Date;
  current: boolean;
}

/**
 * Abonnements push des appareils (spec 014, research R8, data-model.md). Un abonnement est lié à un
 * utilisateur et à la session qui l'a utilisé en dernier ; une adresse d'envoi n'appartient qu'à un
 * utilisateur à la fois (transfert vers le dernier qui active le push sur ce navigateur, NC-8a).
 * Aucune réponse ne contient l'adresse d'envoi ni les clés.
 */
@Injectable()
export class PushSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Configuration utile au navigateur : jamais la clé privée. */
  publicConfig(): { enabled: boolean; publicKey: string | null } {
    return { enabled: this.config.push !== null, publicKey: this.config.push?.publicKey ?? null };
  }

  /**
   * Enregistre l'appareil courant, à l'activation et à chaque ouverture de l'application : création,
   * mise à jour (session, clés, dernière utilisation au plus une fois par 24 h) ou transfert.
   */
  async upsert(userId: string, sessionId: string, dto: UpsertPushSubscriptionDto, userAgent: string | undefined, retry = true): Promise<UpsertResult> {
    if (!this.config.push) throw new AppException('PUSH_DISABLED');
    const invalid = validatePushSubscription(dto);
    if (invalid.length > 0) {
      throw new AppException('VALIDATION_ERROR', { fields: invalid.map((field) => ({ field, messages: [FIELD_MESSAGES[field]] })) });
    }
    const label = deviceLabel(userAgent);
    const now = new Date();
    const keys = { p256dh: dto.keys.p256dh, auth: dto.keys.auth };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.pushSubscription.findUnique({ where: { endpoint: dto.endpoint } });
        if (existing && existing.userId === userId) {
          const touch = now.getTime() - existing.lastUsedAt.getTime() >= TOUCH_INTERVAL_MS;
          const changed =
            existing.sessionId !== sessionId || existing.p256dh !== keys.p256dh || existing.auth !== keys.auth || existing.deviceLabel !== label;
          if (touch || changed) {
            await tx.pushSubscription.update({
              where: { id: existing.id },
              data: { sessionId, ...keys, deviceLabel: label, ...(touch ? { lastUsedAt: now } : {}) },
            });
          }
          return { id: existing.id, deviceLabel: label, created: false };
        }

        if ((await tx.pushSubscription.count({ where: { userId } })) >= MAX_DEVICES_PER_USER) {
          throw new AppException('PUSH_DEVICE_LIMIT');
        }
        if (existing) {
          // Même navigateur, autre compte : l'appareil passe au nouvel utilisateur (NC-8a).
          await tx.pushSubscription.update({
            where: { id: existing.id },
            data: { userId, sessionId, ...keys, deviceLabel: label, createdAt: now, lastUsedAt: now, lastSuccessAt: null },
          });
          return { id: existing.id, deviceLabel: label, created: false };
        }
        const row = await tx.pushSubscription.create({
          data: { userId, sessionId, endpoint: dto.endpoint, ...keys, deviceLabel: label, lastUsedAt: now },
        });
        return { id: row.id, deviceLabel: label, created: true };
      });
    } catch (error) {
      // Deux enregistrements simultanés du même appareil : le second retrouve l'abonnement créé.
      if (retry && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.upsert(userId, sessionId, dto, userAgent, false);
      }
      throw error;
    }
  }

  /**
   * Retire les abonnements liés à une session (« Désactiver sur cet appareil », déconnexion explicite) :
   * l'appareil n'en reçoit plus rien, les autres appareils de l'utilisateur ne changent pas.
   */
  async deleteForSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, sessionId } });
  }

  /** Appareils de l'utilisateur, du plus récent au plus ancien ; l'appareil de la session courante signalé. */
  async listForUser(userId: string, sessionId: string): Promise<DeviceView[]> {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deviceLabel: true, createdAt: true, lastUsedAt: true, sessionId: true },
    });
    return rows.map(({ sessionId: rowSession, ...row }) => ({ ...row, current: rowSession === sessionId }));
  }
}
