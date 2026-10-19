import { Injectable } from '@nestjs/common';
import { Prisma, type DeadlineStage, type Priority, type RequestEventType, type RequestStatus, type Role } from '@prisma/client';
import { toCsv } from '../common/csv';
import { AppException } from '../common/errors';
import { parseLimit } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import type { DashboardActivityQuery, DashboardQuery } from './dashboard.dto';
import {
  ACTIVE_STATUSES,
  ASSIGNED_STATUSES,
  average,
  countByGroup,
  dayIn,
  DONE_STATUSES,
  durationsOf,
  fillDays,
  hasTrackedDeadline,
  isValidTimeZone,
  STATUS_GROUPS,
  summarizePerformance,
  type DurationStats,
  type PerformanceRow,
  type RequestDurations,
  type SnapshotDeadlines,
  type StatusTransition,
} from './domain/dashboard-metrics';

const DAY_MS = 86_400_000;
const DEFAULT_PERIOD_DAYS = 30;
/** Une année scolaire au plus : borne le volume lu pour les délais. */
const MAX_PERIOD_DAYS = 366;
const ALERT_LIMIT = 20;

interface Filters {
  from: Date;
  to: Date;
  categoryIds: string[];
  priorities: Priority[];
  employeeId: string | null;
  tz: string;
}

function invalid(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] });
}

/** Une date seule (AAAA-MM-JJ) vaut minuit UTC ; en fin de période, toute la journée. */
function parseBound(value: string, end: boolean): Date {
  if (value.length === 10) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return end ? new Date(date.getTime() + DAY_MS - 1) : date;
  }
  return new Date(value);
}

export function resolveFilters(query: DashboardQuery, now = new Date()): Filters {
  const to = query.to ? parseBound(query.to, true) : now;
  const from = query.from ? parseBound(query.from, false) : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);
  if (from.getTime() > to.getTime()) throw invalid('from', 'Le début de période doit précéder la fin');
  if (to.getTime() - from.getTime() > MAX_PERIOD_DAYS * DAY_MS) {
    throw invalid('from', `Période limitée à ${MAX_PERIOD_DAYS} jours`);
  }
  const tz = query.tz ?? 'UTC';
  if (!isValidTimeZone(tz)) throw invalid('tz', 'Fuseau horaire inconnu');
  return {
    from,
    to,
    categoryIds: query.categoryId ?? [],
    priorities: query.priority ?? [],
    employeeId: query.employeeId ?? null,
    tz,
  };
}

const statusArray = (statuses: readonly RequestStatus[]) => Prisma.sql`ARRAY[${Prisma.join([...statuses])}]::"RequestStatus"[]`;

const OVERDUE_EXISTS = Prisma.sql`EXISTS (SELECT 1 FROM "RequestEvent" o WHERE o."requestId" = r."id" AND o."type" = 'OVERDUE')`;

/**
 * Condition SQL unique (alias `r`) de toutes les requêtes du tableau de bord : demandes de travail
 * hors brouillons, filtres catégorie, priorité et employé ; période sur la date de création sauf
 * pour la situation actuelle (`withPeriod = false`).
 */
function requestConditions(f: Filters, withPeriod: boolean): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`r."kind" = 'WORK'`, Prisma.sql`r."status" <> 'DRAFT'`];
  if (withPeriod) conditions.push(Prisma.sql`r."createdAt" >= ${f.from}`, Prisma.sql`r."createdAt" <= ${f.to}`);
  if (f.categoryIds.length > 0) conditions.push(Prisma.sql`r."categoryId" IN (${Prisma.join(f.categoryIds.map((id) => Prisma.sql`${id}::uuid`))})`);
  if (f.priorities.length > 0) {
    conditions.push(Prisma.sql`r."priority" IN (${Prisma.join(f.priorities.map((p) => Prisma.sql`${p}::"Priority"`))})`);
  }
  if (f.employeeId) {
    conditions.push(Prisma.sql`(r."requesterId" = ${f.employeeId}::uuid OR r."assigneeId" = ${f.employeeId}::uuid)`);
  }
  return Prisma.join(conditions, ' AND ');
}

interface PerformanceSourceRow {
  id: string;
  priority: Priority;
  status: RequestStatus;
  requesterId: string;
  assigneeId: string | null;
  rulesSnapshot: SnapshotDeadlines | null;
  overdue: boolean;
  overdueNow: boolean;
}

interface CohortRequest extends PerformanceRow {
  id: string;
  requesterId: string;
  assigneeId: string | null;
  overdueNow: boolean;
}

export interface EmployeeStatsView {
  user: { id: string; displayName: string; jobTitle: string | null; role: Role; active: boolean };
  created: number;
  assigned: number;
  pendingTakeover: number;
  inProgress: number;
  done: number;
  overdueNow: number;
  overdueInPeriod: number;
  takeover: DurationStats;
  resolution: DurationStats;
  /** Dernière action enregistrée dans l'historique des demandes (toutes périodes). */
  lastActionAt: Date | null;
}

export interface ActivityItemView {
  id: string;
  type: RequestEventType;
  createdAt: Date;
  actor: { id: string; displayName: string } | null;
  request: { id: string; reference: string; title: string };
  /** Métadonnées en liste blanche : jamais de commentaire, de texte ni de contenu de message. */
  details: Record<string, unknown>;
}

/**
 * Tableau de bord du super administrateur : agrégations SQL pour les compteurs, historique des
 * statuts pour les délais (calculés par dashboard-metrics). Aucune donnée n'est écrite.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: DashboardQuery) {
    const f = resolveFilters(query);
    const inPeriod = requestConditions(f, true);
    const now = requestConditions(f, false);

    const [byStatus, current, byCategory, messages, created, completed, alerts] = await Promise.all([
      this.prisma.$queryRaw<Array<{ status: RequestStatus; count: number }>>`
        SELECT r."status", count(*)::int AS "count" FROM "Request" r WHERE ${inPeriod} GROUP BY r."status"`,
      this.prisma.$queryRaw<Array<{ overdueNow: number; urgentActive: number; unassigned: number }>>`
        SELECT
          count(*) FILTER (WHERE r."overdueStage" IS NOT NULL)::int AS "overdueNow",
          count(*) FILTER (WHERE r."priority" = 'URGENT')::int AS "urgentActive",
          count(*) FILTER (WHERE r."assigneeId" IS NULL AND r."status" = ANY(${statusArray(ASSIGNED_STATUSES)}))::int AS "unassigned"
        FROM "Request" r WHERE ${now} AND r."status" = ANY(${statusArray(ACTIVE_STATUSES)})`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; total: number; active: number; done: number; overdue: number }>>`
        SELECT c."id", c."name", count(*)::int AS "total",
          count(*) FILTER (WHERE r."status" = ANY(${statusArray(ACTIVE_STATUSES)}))::int AS "active",
          count(*) FILTER (WHERE r."status" = ANY(${statusArray(DONE_STATUSES)}))::int AS "done",
          count(*) FILTER (WHERE ${OVERDUE_EXISTS})::int AS "overdue"
        FROM "Request" r JOIN "Category" c ON c."id" = r."categoryId"
        WHERE ${inPeriod} GROUP BY c."id", c."name" ORDER BY "total" DESC, c."name" ASC`,
      this.prisma.$queryRaw<Array<{ kind: 'TEXT' | 'VOICE'; count: number }>>`
        SELECT m."kind", count(*)::int AS "count" FROM "Message" m JOIN "Request" r ON r."id" = m."requestId"
        WHERE ${inPeriod} AND m."kind" <> 'SYSTEM' GROUP BY m."kind"`,
      this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
        SELECT to_char(r."createdAt" AT TIME ZONE ${f.tz}, 'YYYY-MM-DD') AS "day", count(*)::int AS "count"
        FROM "Request" r WHERE ${inPeriod} GROUP BY 1`,
      // Première fin de traitement de chaque demande de la période.
      this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
        SELECT to_char(d."at" AT TIME ZONE ${f.tz}, 'YYYY-MM-DD') AS "day", count(*)::int AS "count"
        FROM (
          SELECT min(e."createdAt") AS "at" FROM "RequestEvent" e JOIN "Request" r ON r."id" = e."requestId"
          WHERE ${inPeriod} AND e."type" = 'STATUS_CHANGED' AND e."toValue"->>'status' = 'DONE'
          GROUP BY e."requestId"
        ) d GROUP BY 1`,
      this.alerts(now),
    ]);

    const overdueInPeriod = byCategory.reduce((sum, c) => sum + c.overdue, 0);
    return {
      period: { from: f.from, to: f.to },
      counts: { ...countByGroup(byStatus), overdueInPeriod },
      byStatus: byStatus.sort((a, b) => b.count - a.count),
      current: current[0] ?? { overdueNow: 0, urgentActive: 0, unassigned: 0 },
      byCategory: byCategory.map((c) => ({ category: { id: c.id, name: c.name }, total: c.total, active: c.active, done: c.done, overdue: c.overdue })),
      messages: {
        text: messages.find((m) => m.kind === 'TEXT')?.count ?? 0,
        voice: messages.find((m) => m.kind === 'VOICE')?.count ?? 0,
      },
      daily: fillDays(
        dayIn(f.from, f.tz),
        dayIn(f.to, f.tz),
        new Map(created.map((d) => [d.day, d.count])),
        new Map(completed.map((d) => [d.day, d.count])),
      ),
      alerts,
    };
  }

  /** Demandes en retard ou urgentes à traiter maintenant (hors période), les retards d'abord. */
  private async alerts(now: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT r."id" FROM "Request" r
      WHERE ${now} AND r."status" = ANY(${statusArray(ACTIVE_STATUSES)})
        AND (r."overdueStage" IS NOT NULL OR r."priority" = 'URGENT')
      ORDER BY (r."overdueStage" IS NOT NULL) DESC, r."currentDueAt" ASC NULLS LAST, r."createdAt" ASC
      LIMIT ${ALERT_LIMIT}`;
    const ids = rows.map((r) => r.id);
    const requests = await this.prisma.request.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        reference: true,
        title: true,
        priority: true,
        status: true,
        createdAt: true,
        currentStage: true,
        currentDueAt: true,
        overdueStage: true,
        category: { select: { id: true, name: true } },
        assignee: { select: { id: true, displayName: true } },
      },
    });
    const byId = new Map(requests.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r) => r !== undefined);
  }

  /** Demandes de la période avec leurs délais calculés sur l'historique des statuts. */
  private async cohort(f: Filters): Promise<CohortRequest[]> {
    const where = requestConditions(f, true);
    const [rows, events] = await Promise.all([
      this.prisma.$queryRaw<PerformanceSourceRow[]>`
        SELECT r."id", r."priority", r."status", r."requesterId", r."assigneeId", r."rulesSnapshot",
          ${OVERDUE_EXISTS} AS "overdue", (r."overdueStage" IS NOT NULL) AS "overdueNow"
        FROM "Request" r WHERE ${where}`,
      this.prisma.$queryRaw<Array<{ requestId: string; to: RequestStatus; at: Date }>>`
        SELECT e."requestId", e."toValue"->>'status' AS "to", e."createdAt" AS "at"
        FROM "RequestEvent" e JOIN "Request" r ON r."id" = e."requestId"
        WHERE ${where} AND e."type" = 'STATUS_CHANGED'
        ORDER BY e."requestId", e."seq"`,
    ]);
    const transitions = new Map<string, StatusTransition[]>();
    for (const e of events) {
      const list = transitions.get(e.requestId) ?? [];
      list.push({ to: e.to, at: e.at });
      transitions.set(e.requestId, list);
    }
    return rows.map((r) => ({
      id: r.id,
      priority: r.priority,
      status: r.status,
      requesterId: r.requesterId,
      assigneeId: r.assigneeId,
      overdue: r.overdue,
      overdueNow: r.overdueNow,
      tracked: hasTrackedDeadline(r.rulesSnapshot),
      durations: durationsOf(transitions.get(r.id) ?? []),
    }));
  }

  async performance(query: DashboardQuery) {
    const f = resolveFilters(query);
    const rows = await this.cohort(f);
    const priorities: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'NORMAL'];
    return {
      period: { from: f.from, to: f.to },
      overall: summarizePerformance(rows),
      byPriority: priorities.map((priority) => ({
        priority,
        total: rows.filter((r) => r.priority === priority).length,
        ...summarizePerformance(rows.filter((r) => r.priority === priority)),
      })),
    };
  }

  async employees(query: DashboardQuery): Promise<{ period: { from: Date; to: Date }; items: EmployeeStatsView[] }> {
    const f = resolveFilters(query);
    const rows = await this.cohort(f);
    const ids = new Set<string>();
    for (const r of rows) {
      ids.add(r.requesterId);
      if (r.assigneeId) ids.add(r.assigneeId);
    }
    if (f.employeeId) {
      ids.clear();
      ids.add(f.employeeId);
    } else {
      // Comptes actifs sans demande sur la période : affichés à zéro plutôt qu'absents.
      for (const id of await this.availableEmployeeIds(f)) ids.add(id);
    }
    const [users, lastActions] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, displayName: true, jobTitle: true, role: true, active: true },
      }),
      this.prisma.requestEvent.groupBy({
        by: ['actorId'],
        where: { actorId: { in: [...ids] }, request: { kind: 'WORK' } },
        _max: { createdAt: true },
      }),
    ]);
    const lastAction = new Map(lastActions.map((a) => [a.actorId, a._max.createdAt]));

    const items = users.map((user): EmployeeStatsView => {
      const assigned = rows.filter((r) => r.assigneeId === user.id);
      const inGroup = (statuses: readonly RequestStatus[]) => assigned.filter((r) => statuses.includes(r.status)).length;
      const durations = (pick: (d: RequestDurations) => number | null) => average(assigned.map((r) => pick(r.durations)));
      return {
        user,
        created: rows.filter((r) => r.requesterId === user.id).length,
        assigned: assigned.length,
        pendingTakeover: inGroup(STATUS_GROUPS.pendingTakeover),
        inProgress: inGroup(STATUS_GROUPS.inProgress),
        done: inGroup(DONE_STATUSES),
        overdueNow: assigned.filter((r) => r.overdueNow && ACTIVE_STATUSES.includes(r.status)).length,
        overdueInPeriod: assigned.filter((r) => r.overdue).length,
        takeover: durations((d) => d.takeoverMs),
        resolution: durations((d) => d.resolutionMs),
        lastActionAt: lastAction.get(user.id) ?? null,
      };
    });
    items.sort((a, b) => b.assigned - a.assigned || b.created - a.created || a.user.displayName.localeCompare(b.user.displayName, 'fr'));
    return { period: { from: f.from, to: f.to }, items };
  }

  /**
   * Export CSV des demandes de la période (mêmes filtres que le tableau de bord), les plus récentes
   * d'abord. Métadonnées seulement : ni description, ni message, ni motif.
   */
  async exportCsv(query: DashboardQuery): Promise<string> {
    const f = resolveFilters(query);
    const cohort = new Map((await this.cohort(f)).map((r) => [r.id, r]));
    const requests = await this.prisma.request.findMany({
      where: { id: { in: [...cohort.keys()] } },
      select: {
        id: true,
        reference: true,
        title: true,
        priority: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        acceptedAt: true,
        doneAt: true,
        closedAt: true,
        rejectedAt: true,
        cancelledAt: true,
        currentDueAt: true,
        overdueStage: true,
        category: { select: { name: true } },
        requester: { select: { displayName: true } },
        assignee: { select: { displayName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const header = [
      'Référence', 'Titre', 'Catégorie', 'Priorité', 'Statut', 'Demandeur', 'Employé affecté',
      'Création', 'Soumission', 'Acceptation', 'Fin de traitement', 'Clôture', 'Refus', 'Annulation', 'Échéance en cours',
      'En retard actuellement', 'Retard sur la période', 'Prise en charge (min)', 'Traitement net (min)', 'Traitement brut (min)',
    ];
    const rows = requests.map((r) => {
      const { durations, overdue } = cohort.get(r.id)!;
      return [
        r.reference, r.title, r.category.name, PRIORITY_LABELS[r.priority], STATUS_LABELS[r.status], r.requester.displayName, r.assignee?.displayName,
        r.createdAt, r.submittedAt, r.acceptedAt, r.doneAt, r.closedAt, r.rejectedAt, r.cancelledAt, r.currentDueAt,
        r.overdueStage ? `Oui (${STAGE_LABELS[r.overdueStage]})` : 'Non', overdue ? 'Oui' : 'Non',
        minutes(durations.takeoverMs), minutes(durations.resolutionMs), minutes(durations.grossResolutionMs),
      ];
    });
    return toCsv(header, rows);
  }

  /**
   * Comptes actifs attendus dans le tableau même sans activité : les destinataires des catégories
   * filtrées, sinon tous les comptes actifs hors super administrateurs.
   */
  private async availableEmployeeIds(f: Filters): Promise<string[]> {
    if (f.categoryIds.length > 0) {
      const recipients = await this.prisma.categoryRecipient.findMany({
        where: { categoryId: { in: f.categoryIds }, user: { active: true } },
        select: { userId: true },
      });
      return recipients.map((r) => r.userId);
    }
    const users = await this.prisma.user.findMany({ where: { active: true, role: { not: 'SUPER_ADMIN' } }, select: { id: true } });
    return users.map((u) => u.id);
  }

  /** Dernières actions sur les demandes (période sur la date de l'action), de la plus récente à la plus ancienne. */
  async activity(query: DashboardActivityQuery): Promise<{ items: ActivityItemView[]; nextCursor: string | null }> {
    const f = resolveFilters(query);
    const limit = parseLimit(query.limit);
    const cursor = query.cursor ? Prisma.sql`AND e."seq" < ${BigInt(query.cursor)}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        type: RequestEventType;
        createdAt: Date;
        seq: bigint;
        fromValue: Prisma.JsonValue;
        toValue: Prisma.JsonValue;
        actorId: string | null;
        actorName: string | null;
        requestId: string;
        reference: string;
        title: string;
      }>
    >`
      SELECT e."id", e."type", e."createdAt", e."seq", e."fromValue", e."toValue",
        a."id" AS "actorId", a."displayName" AS "actorName", r."id" AS "requestId", r."reference", r."title"
      FROM "RequestEvent" e
      JOIN "Request" r ON r."id" = e."requestId"
      LEFT JOIN "User" a ON a."id" = e."actorId"
      WHERE ${requestConditions(f, false)} AND e."createdAt" >= ${f.from} AND e."createdAt" <= ${f.to} ${cursor}
      ORDER BY e."seq" DESC
      LIMIT ${limit + 1}`;

    const page = rows.slice(0, limit);
    const assigneeIds = page
      .filter((e) => e.type === 'ASSIGNED' || e.type === 'REASSIGNED')
      .map((e) => field(e.toValue, 'assigneeId'))
      .filter((id): id is string => typeof id === 'string');
    const assignees = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u]),
    );

    return {
      nextCursor: rows.length > limit ? String(page.at(-1)!.seq) : null,
      items: page.map((e) => ({
        id: e.id,
        type: e.type,
        createdAt: e.createdAt,
        actor: e.actorId ? { id: e.actorId, displayName: e.actorName ?? '' } : null,
        request: { id: e.requestId, reference: e.reference, title: e.title },
        details: eventDetails(e.type, e.fromValue, e.toValue, assignees),
      })),
    };
  }
}

/** Libellés de l'export CSV, identiques à ceux de l'interface. */
const STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: 'Brouillon',
  PENDING_ADMIN_VALIDATION: 'En attente de validation administrative',
  SENT: 'Envoyée',
  ACCEPTED: 'Acceptée',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminée',
  PENDING_FINAL_VALIDATION: 'En attente de validation finale',
  TO_CORRECT: 'À corriger',
  CLOSED: 'Clôturée',
  REJECTED: 'Refusée',
  CANCELLED: 'Annulée',
  BROADCAST: 'Diffusée',
  UNFILLED: 'Non pourvue',
  EN_ROUTE: 'En route',
  LATE: 'En retard',
  ON_DUTY: 'En poste',
  RELIEF_PENDING: 'Relève demandée',
};

const PRIORITY_LABELS: Record<Priority, string> = { NORMAL: 'Normale', MEDIUM: 'Moyenne', HIGH: 'Haute', URGENT: 'Urgente' };

const STAGE_LABELS: Record<DeadlineStage, string> = {
  VALIDATION: 'validation',
  TAKEOVER: 'prise en charge',
  COMPLETION: 'réalisation',
  ARRIVAL: 'arrivée',
};

/** Durée en minutes, une décimale, virgule décimale pour les tableurs français ; vide sans mesure. */
function minutes(ms: number | null): string {
  return ms === null ? '' : (Math.round(ms / 6_000) / 10).toString().replace('.', ',');
}

function field(value: Prisma.JsonValue, key: string): unknown {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

/** Liste blanche des métadonnées affichables par type d'événement. */
function eventDetails(
  type: RequestEventType,
  fromValue: Prisma.JsonValue,
  toValue: Prisma.JsonValue,
  assignees: ReadonlyMap<string, { id: string; displayName: string }>,
): Record<string, unknown> {
  switch (type) {
    case 'STATUS_CHANGED':
      return { from: field(fromValue, 'status') ?? null, to: field(toValue, 'status') ?? null };
    case 'PRIORITY_CHANGED':
      return { from: field(fromValue, 'priority') ?? null, to: field(toValue, 'priority') ?? null };
    case 'ASSIGNED':
    case 'REASSIGNED': {
      const id = field(toValue, 'assigneeId');
      return { assignee: typeof id === 'string' ? (assignees.get(id) ?? null) : null };
    }
    case 'OVERDUE':
      return { stage: field(toValue, 'stage') ?? null };
    case 'MESSAGE_ADDED':
    case 'FILE_ADDED':
      return { kind: field(toValue, 'kind') ?? null };
    default:
      return {};
  }
}
