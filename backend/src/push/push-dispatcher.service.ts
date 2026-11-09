import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { SettingsService } from '../settings/settings.service';
import { pushCategoryOf, pushRecipientAllowed } from './domain/push-category';
import { buildPushPayload } from './domain/push-payload';
import { isWithinPushWindow } from './domain/push-window';
import { nextAttemptDelayMs } from './domain/push-retry';
import { PUSH_SENDER, type PushSender, type PushSendResult } from './web-push.sender';

/** Attente entre deux tentatives ; remplacée dans les tests pour décider quand la suivante part. */
export interface PushScheduler {
  wait(ms: number): Promise<void>;
}

export const PUSH_SCHEDULER = Symbol('PUSH_SCHEDULER');

/** Attente réelle, qui n'empêche pas le processus de s'arrêter. */
export const timerScheduler: PushScheduler = {
  wait: (ms) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms).unref();
    }),
};

/** Envois simultanés au plus (research R7). */
const MAX_CONCURRENT_SENDS = 10;

/** Empreinte courte d'une adresse d'envoi pour les journaux : jamais l'adresse elle-même (FR-012). */
function fingerprint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 12);
}

/**
 * Envoi des notifications en push (spec 014, research R2, R7). Appelé par le diffuseur composé après la
 * validation de la transaction ; jamais attendu, ne lève jamais d'exception (FR-005). Sans effet tant que
 * l'établissement n'a pas configuré ses clés (D9, FR-013).
 *
 * Pour chaque notification : catégorie push (type et nature de la demande), filtre « Enseignant arrivé »
 * (D4), compte actif, catégorie active dans ses préférences, plage horaire ouverte (au premier envoi),
 * puis un envoi par appareil abonné du destinataire. Avant chaque tentative,
 * l'abonnement est relu : supprimé (déconnexion), transféré à un autre utilisateur ou compte désactivé →
 * abandon (FR-020). Les tentatives en attente sont perdues au redémarrage, comme Socket.IO (NC-4).
 */
@Injectable()
export class PushDispatcher {
  private readonly logger = new Logger(PushDispatcher.name);
  private readonly pending = new Set<Promise<void>>();
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    @Inject(PUSH_SCHEDULER) private readonly scheduler: PushScheduler,
    private readonly settings: SettingsService,
  ) {}

  enqueue(notifications: Notification[]): void {
    if (!this.config.push || notifications.length === 0) return;
    this.track(
      this.dispatch(notifications).catch((error: unknown) => {
        this.logger.error(`Push : préparation impossible (${error instanceof Error ? error.name : 'erreur inconnue'})`);
      }),
    );
  }

  /** Résolue quand tous les envois en cours, nouvelles tentatives comprises, sont terminés. */
  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  private track(work: Promise<void>): void {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }

  private async dispatch(notifications: Notification[]): Promise<void> {
    // Plage d'envoi de l'établissement, évaluée au premier envoi (D6) : hors plage, rien n'est envoyé ni différé.
    const settings = await this.settings.getAll();
    const window = { days: settings.pushWindowDays, start: settings.pushWindowStart, end: settings.pushWindowEnd };
    if (!isWithinPushWindow(new Date(), window, this.config.schoolTimezone)) return;

    // Notifications de demande seulement : celles des communications aux parents (015) restent dans la cloche.
    const requestIds = [...new Set(notifications.flatMap((n) => (n.requestId ? [n.requestId] : [])))];
    if (requestIds.length === 0) return;
    const requests = await this.prisma.request.findMany({
      where: { id: { in: requestIds } },
      select: { id: true, kind: true, reference: true, assigneeId: true, coverage: { select: { class: { select: { name: true } } } } },
    });
    const requestById = new Map(requests.map((r) => [r.id, r]));
    // Préférences lues directement (pas de NotificationPreferencesService : NotificationsModule importe
    // déjà PushModule, l'inverse créerait une dépendance circulaire). Absentes : tout est actif.
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: [...new Set(notifications.map((n) => n.userId))] } },
    });
    const preferenceByUser = new Map(preferences.map((p) => [p.userId, p]));

    for (const notification of notifications) {
      const req = notification.requestId ? requestById.get(notification.requestId) : undefined;
      const category = req ? pushCategoryOf(notification.type, req.kind) : null;
      if (!req || !category) continue;
      if (!pushRecipientAllowed(notification.type, notification.userId, req.assigneeId)) continue;
      if (preferenceByUser.get(notification.userId)?.[category] === false) continue;

      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId: notification.userId, user: { active: true } },
        select: { id: true },
      });
      if (subscriptions.length === 0) continue;

      const payload = JSON.stringify(
        buildPushPayload({
          notificationId: notification.id,
          type: notification.type,
          requestId: req.id,
          kind: req.kind,
          reference: req.reference,
          className: req.coverage?.class.name ?? null,
        }),
      );
      const topic = notification.id.replace(/-/g, '');
      for (const { id } of subscriptions) {
        this.track(
          this.deliver(id, notification.userId, notification.type, payload, topic).catch((error: unknown) => {
            this.logger.error(`Push ${notification.type} : envoi interrompu (${error instanceof Error ? error.name : 'erreur inconnue'})`);
          }),
        );
      }
    }
  }

  private async deliver(subscriptionId: string, userId: string, type: string, payload: string, topic: string): Promise<void> {
    const startedAt = Date.now();
    for (let attempt = 1; ; attempt++) {
      // Relu à chaque tentative : la déconnexion, le transfert de l'appareil ou la désactivation l'emportent.
      const target = await this.prisma.pushSubscription.findFirst({
        where: { id: subscriptionId, userId, user: { active: true } },
        select: { endpoint: true, p256dh: true, auth: true },
      });
      if (!target) return;

      // Une exception de l'envoyeur compte comme une erreur réseau : nouvelle tentative, jamais de rejet non traité.
      const result = await this.withSlot(() =>
        this.sender
          .send({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, { topic })
          .catch((): PushSendResult => ({ statusCode: null })),
      );
      const decision = nextAttemptDelayMs(attempt, result, Date.now() - startedAt);
      const device = fingerprint(target.endpoint);

      if (decision === 'done') {
        await this.prisma.pushSubscription.updateMany({ where: { id: subscriptionId, userId }, data: { lastSuccessAt: new Date() } });
        return;
      }
      if (decision === 'delete') {
        await this.prisma.pushSubscription.deleteMany({ where: { id: subscriptionId, userId } });
        this.logger.log(`Push ${type} : abonnement supprimé (code ${result.statusCode}, appareil ${device})`);
        return;
      }
      if (decision === 'drop') {
        this.logger.warn(`Push ${type} : envoi abandonné après ${attempt} tentative(s) (code ${result.statusCode ?? 'réseau'}, appareil ${device})`);
        return;
      }
      await this.scheduler.wait(decision);
    }
  }

  /** Au plus MAX_CONCURRENT_SENDS envois en même temps. */
  private async withSlot<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENT_SENDS) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await work();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
