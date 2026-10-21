/**
 * Préparation de données fictives communes aux scénarios, par l'API (vraies règles de
 * l'application). Seul le temps écoulé est simulé directement dans la base jetable.
 */
import { randomUUID } from 'node:crypto';
import type { SeedContext } from './demo';

export async function categoryId(ctx: SeedContext, name: string): Promise<string> {
  return (await ctx.prisma.category.findUniqueOrThrow({ where: { name } })).id;
}

export async function userId(ctx: SeedContext, username: string): Promise<string> {
  return (await ctx.prisma.user.findUniqueOrThrow({ where: { username } })).id;
}

export interface WorkRequestInput {
  title: string;
  category: string;
  priority?: 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT';
  description?: string;
  /** Compte destinataire (mode direct ou entre enseignants) ; absent : service par défaut. */
  recipient?: string;
}

export async function createWorkRequest(ctx: SeedContext, requester: string, input: WorkRequestInput): Promise<string> {
  const api = await ctx.as(requester);
  const created = await api<{ id: string }>('/api/requests', {
    clientId: randomUUID(),
    title: input.title,
    description: input.description ?? 'Données fictives de démonstration.',
    categoryId: await categoryId(ctx, input.category),
    priority: input.priority ?? 'NORMAL',
    ...(input.recipient ? { recipientId: await userId(ctx, input.recipient) } : {}),
  });
  return created.id;
}

/** Enchaîne des actions sur une demande avec la session d'un compte (version relue à chaque fois). */
export async function act(ctx: SeedContext, username: string, requestId: string, actions: string[], extra: Record<string, unknown> = {}): Promise<void> {
  const api = await ctx.as(username);
  for (const action of actions) {
    const { version } = await ctx.prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    await api(`/api/requests/${requestId}/actions`, { action, version, ...extra });
  }
}

/** Simule le temps écoulé : seuil d'alerte ou échéance dépassés (base jetable uniquement). */
export async function elapse(ctx: SeedContext, requestId: string, what: 'warn' | 'due'): Promise<void> {
  const past = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  await ctx.prisma.request.update({
    where: { id: requestId },
    data: what === 'warn' ? { warnAt: past(1) } : { warnAt: past(5), currentDueAt: past(1) },
  });
}

/** Attend que les tâches planifiées aient posé les alertes attendues du super administrateur. */
export async function waitForSuperAdminAlerts(ctx: SeedContext, types: string[]): Promise<void> {
  const superadmin = await userId(ctx, 'superadmin');
  const deadline = Date.now() + 90_000;
  for (;;) {
    const present = new Set((await ctx.prisma.notification.findMany({ where: { userId: superadmin }, select: { type: true } })).map((n) => n.type as string));
    if (types.every((t) => present.has(t))) return;
    if (Date.now() > deadline) throw new Error(`Alertes attendues absentes : ${types.filter((t) => !present.has(t)).join(', ')}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

interface SchoolClass {
  id: string;
  name: string;
}

/** Fuseau de l'école (défaut de l'API, SCHOOL_TIMEZONE non renseigné par la démo). */
const SCHOOL_TZ = 'Europe/Paris';

/** Jour (AAAA-MM-JJ) et heure (HH:MM) de l'école pour un instant. */
function schoolWallClock(at: Date): { date: string; time: string } {
  return {
    date: new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TZ }).format(at),
    time: new Intl.DateTimeFormat('fr-FR', { timeZone: SCHOOL_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at),
  };
}

/** Heure de l'école (HH:MM) dans N minutes, plafonnée à 23:59 : champs horaires des formulaires. */
export function schoolTime(minutes: number): string {
  const now = schoolWallClock(new Date());
  const at = schoolWallClock(new Date(Date.now() + minutes * 60_000));
  return at.date === now.date ? at.time : '23:59';
}

async function classIdOf(ctx: SeedContext, username: string, className: string): Promise<string> {
  const classes = await (await ctx.as(username))<SchoolClass[]>('/api/coverage/classes');
  const id = classes.find((c) => c.name === className)?.id;
  if (!id) throw new Error(`Classe introuvable : ${className}`);
  return id;
}

export interface CoverageInput {
  className: string;
  /** Surveillant assigné (compte du groupe Surveillants). */
  assignee: string;
  type?: 'LATENESS' | 'ABSENCE' | 'EMPTY_CLASS';
  /** Début dans N minutes (défaut : maintenant). */
  startInMinutes?: number;
  /** Durée du créneau (défaut : 60 min). */
  minutes?: number;
  reason?: string;
}

/** Affectation directe par le super administrateur : créée assignée, le surveillant est prévenu. */
export async function createCoverage(ctx: SeedContext, input: CoverageInput): Promise<string> {
  const api = await ctx.as('superadmin');
  const startAt = new Date(Date.now() + (input.startInMinutes ?? 0) * 60_000);
  const endAt = new Date(startAt.getTime() + (input.minutes ?? 60) * 60_000);
  const created = await api<{ id: string }>('/api/coverage', {
    clientId: randomUUID(),
    classId: await classIdOf(ctx, 'superadmin', input.className),
    type: input.type ?? 'ABSENCE',
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    assigneeId: await userId(ctx, input.assignee),
    ...(input.reason ? { reason: input.reason } : {}),
  });
  return created.id;
}

export interface TeacherRequestInput {
  className: string;
  type?: 'LATENESS' | 'ABSENCE';
  startInMinutes?: number;
  minutes?: number;
  reason?: string;
}

/**
 * Retard ou absence signalé par un enseignant : en attente d'assignation par un admin. Créneau du
 * jour de l'école (heure de fin plafonnée à 23:59, comme les e2e).
 */
export async function createTeacherRequest(ctx: SeedContext, teacher: string, input: TeacherRequestInput): Promise<string> {
  const startAt = new Date(Date.now() + (input.startInMinutes ?? 0) * 60_000);
  const start = schoolWallClock(startAt);
  const end = schoolWallClock(new Date(startAt.getTime() + (input.minutes ?? 60) * 60_000));
  const created = await (await ctx.as(teacher))<{ id: string }>('/api/coverage/teacher-requests', {
    clientId: randomUUID(),
    type: input.type ?? 'ABSENCE',
    classId: await classIdOf(ctx, teacher, input.className),
    date: start.date,
    startTime: start.time,
    endTime: end.date === start.date ? end.time : '23:59',
    ...(input.reason ? { reason: input.reason } : {}),
  });
  return created.id;
}

export async function coverageAction(ctx: SeedContext, requestId: string, action: string, extra: Record<string, unknown> = {}): Promise<void> {
  const api = await ctx.as('superadmin');
  const { version } = await ctx.prisma.request.findUniqueOrThrow({ where: { id: requestId } });
  await api(`/api/coverage/${requestId}/actions`, { action, version, ...extra });
}
