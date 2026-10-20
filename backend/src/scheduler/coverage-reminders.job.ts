import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { CoverageReminder, NotificationType, Priority, RequestEventType } from '@prisma/client';
import { AppException } from '../common/errors';
import { endOfLocalDay } from '../common/school-time';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { CoverageActionsService, toOpenReminder, type Effects, type Tx } from '../coverage/coverage-actions.service';
import { adminRecipients, superAdminRecipients } from '../coverage/coverage-groups';
import type { CoverageRow } from '../coverage/coverage.mapper';
import { afterSend, type ReminderSettings } from '../coverage/domain/coverage-reminders';
import { ACTIVE_GUARD_STATUSES } from '../coverage/domain/coverage-state-machine';
import { JOB_INTERVAL_MS } from './job-interval';

const MINUTE_MS = 60_000;
const BATCH = 200;

/** Envoi de chaque type d'échéance (contracts/realtime-events.md). */
const DISPATCH: Record<
  CoverageReminder['kind'],
  { to: 'ADMINS' | 'SUPER_ADMINS' | 'ASSIGNEE'; type: NotificationType; urgent: boolean; event: RequestEventType }
> = {
  TAKEOVER: { to: 'ADMINS', type: 'COVERAGE_TAKEOVER_EXPIRED', urgent: true, event: 'REMINDER_SENT' },
  TAKEOVER_ESCALATION: { to: 'SUPER_ADMINS', type: 'COVERAGE_ESCALATED', urgent: true, event: 'ESCALATED' },
  MORNING: { to: 'ADMINS', type: 'COVERAGE_MORNING_REMINDER', urgent: false, event: 'REMINDER_SENT' },
  END_OF_SLOT: { to: 'ASSIGNEE', type: 'COVERAGE_CLOSE_REMINDER', urgent: false, event: 'REMINDER_SENT' },
  END_OF_SLOT_ADMIN: { to: 'ADMINS', type: 'COVERAGE_CLOSE_REMINDER', urgent: false, event: 'REMINDER_SENT' },
  SUPPORT_DECISION: { to: 'ADMINS', type: 'COVERAGE_SUPPORT_REMINDER', urgent: true, event: 'REMINDER_SENT' },
  SUPPORT_ESCALATION: { to: 'SUPER_ADMINS', type: 'COVERAGE_ESCALATED', urgent: true, event: 'ESCALATED' },
};

/**
 * Échéances des affectations (R2, R3) : délai de prise en charge et escalade, rappel du matin,
 * rappels de clôture, rappels de renfort ; passage « non pourvue » des demandes jamais assignées
 * dont le créneau est fini (FR-008a). Idempotent et sans doublon, même avec plusieurs instances :
 * - verrou consultatif transactionnel global : une seule exécution à la fois ;
 * - lignes échues verrouillées (`FOR UPDATE SKIP LOCKED`), envoi tracé par `attempts`/`resolvedAt` ;
 * - condition revérifiée avant chaque envoi : une échéance devenue sans objet est close (OBSOLETE).
 */
@Injectable()
export class CoverageRemindersJob {
  private readonly logger = new Logger(CoverageRemindersJob.name);
  private running = false;

  constructor(
    private readonly actions: CoverageActionsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Interval(JOB_INTERVAL_MS)
  async tick(): Promise<void> {
    if (!this.config.jobsEnabled || this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
    }
  }

  /** Un passage complet ; renvoie le nombre de notifications d'échéance envoyées (0 si une autre exécution est en cours). */
  async runOnce(now = new Date()): Promise<number> {
    return this.actions.run(async (tx, effects) => {
      const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext('coverage-reminders-job')) AS locked`;
      if (!locked) return 0;

      await this.expireUnfilled(tx, effects, now);

      const due = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "CoverageReminder"
        WHERE "resolvedAt" IS NULL AND "dueAt" <= ${now}
        ORDER BY "dueAt" ASC
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`;
      let sent = 0;
      for (const { id } of due) {
        if (await this.process(tx, effects, id, now)) sent += 1;
      }
      return sent;
    });
  }

  /** Demandes « en attente » dont le créneau est fini (fin inconnue : fin de la journée locale). */
  private async expireUnfilled(tx: Tx, effects: Effects, now: Date): Promise<void> {
    const candidates = await tx.request.findMany({
      where: {
        kind: 'COVERAGE',
        status: 'PENDING',
        coverage: { OR: [{ plannedEndAt: { lte: now } }, { plannedEndAt: null, startAt: { lte: now } }] },
      },
      select: { id: true, coverage: { select: { startAt: true, plannedEndAt: true } } },
      take: BATCH,
    });
    for (const c of candidates) {
      const end = c.coverage!.plannedEndAt ?? endOfLocalDay(c.coverage!.startAt, this.config.schoolTimezone);
      if (end > now) continue;
      try {
        await this.actions.performSystemInTx(tx, c.id, 'EXPIRE_UNFILLED', effects, { now });
      } catch (error) {
        // Action d'un utilisateur au même instant : l'échéance n'est plus d'actualité.
        if (!(error instanceof AppException && error.code === 'STATE_CHANGED')) throw error;
      }
    }
  }

  /** Traite une échéance ; true si une notification est partie. */
  private async process(tx: Tx, effects: Effects, id: string, now: Date): Promise<boolean> {
    const reminder = await tx.coverageReminder.findUniqueOrThrow({ where: { id } });
    const row = await this.actions.load(tx, reminder.requestId);
    const close = (resolution: string) =>
      tx.coverageReminder.update({ where: { id }, data: { resolvedAt: now, resolution } });
    if (!row) {
      await close('OBSOLETE');
      return false;
    }
    const settings = await this.actions.reminderSettings(row);

    if (!(await this.stillRelevant(tx, reminder, row))) {
      await close('OBSOLETE');
      return false;
    }
    // Rappel de clôture : jamais avant la fin réelle du créneau (prolongation, fin inconnue, FR-016a).
    const earliest = this.earliestCloseReminder(reminder, row, settings);
    if (earliest && earliest > now) {
      await tx.coverageReminder.update({ where: { id }, data: { dueAt: earliest } });
      return false;
    }

    const dispatch = DISPATCH[reminder.kind];
    const recipients =
      dispatch.to === 'ASSIGNEE' ? [row.assigneeId] : dispatch.to === 'ADMINS' ? await adminRecipients(tx) : await superAdminRecipients(tx);
    const priority: Priority = dispatch.urgent ? 'URGENT' : row.priority;
    await this.actions.notify(tx, effects, recipients, null, dispatch.type, row.id, priority);
    await tx.requestEvent.create({
      data: { requestId: row.id, actorId: null, type: dispatch.event, toValue: { kind: reminder.kind, attempt: reminder.attempts + 1 } },
    });

    const next = afterSend(toOpenReminder(reminder), now, settings);
    await tx.coverageReminder.update({
      where: { id },
      data: {
        attempts: next.attempts,
        ...(next.resolution ? { resolvedAt: now, resolution: next.resolution } : {}),
        ...(next.nextDueAt ? { dueAt: next.nextDueAt } : {}),
      },
    });
    if (next.create.length > 0) {
      await tx.coverageReminder.createMany({ data: next.create.map((plan) => ({ requestId: row.id, ...plan })) });
    }
    return true;
  }

  /** La condition de l'échéance tient-elle encore ? */
  private async stillRelevant(tx: Tx, reminder: CoverageReminder, row: CoverageRow): Promise<boolean> {
    switch (reminder.kind) {
      case 'TAKEOVER':
      case 'TAKEOVER_ESCALATION':
      case 'MORNING':
        return row.status === 'PENDING';
      case 'END_OF_SLOT':
      case 'END_OF_SLOT_ADMIN':
        return ACTIVE_GUARD_STATUSES.includes(row.status as (typeof ACTIVE_GUARD_STATUSES)[number]);
      case 'SUPPORT_DECISION':
      case 'SUPPORT_ESCALATION': {
        if (!reminder.supportId) return false;
        const support = await tx.coverageSupport.findUnique({ where: { id: reminder.supportId }, select: { releasedAt: true } });
        return support !== null && support.releasedAt === null && (row.status === 'ON_DUTY' || row.status === 'RELIEF_PENDING');
      }
    }
  }

  /** Échéance la plus tôt possible d'un rappel de clôture ; null pour les autres types. */
  private earliestCloseReminder(reminder: CoverageReminder, row: CoverageRow, settings: ReminderSettings): Date | null {
    if (reminder.kind !== 'END_OF_SLOT' && reminder.kind !== 'END_OF_SLOT_ADMIN') return null;
    const c = row.coverage!;
    const end = c.plannedEndAt ?? endOfLocalDay(c.startAt, settings.timezone);
    const delay =
      settings.closeReminderMinutes + (reminder.kind === 'END_OF_SLOT_ADMIN' ? settings.closeEscalationMinutes : 0);
    return new Date(end.getTime() + delay * MINUTE_MS);
  }
}
