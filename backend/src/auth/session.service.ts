import { Inject, Injectable } from '@nestjs/common';
import type { Session, User } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/config';
import { permissionsFor } from '../requests/domain/access-policy';
import { SettingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from './auth.types';

const MINUTE_MS = 60_000;
/** Évite une écriture en base à chaque requête : lastSeenAt n'est rafraîchi qu'au-delà de ce délai. */
const TOUCH_INTERVAL_MS = MINUTE_MS;

type SessionProblem = 'USER_INACTIVE' | 'EXPIRED' | 'IDLE_EXPIRED';

/** Raison pour laquelle une session n'est plus valide, ou null (règle commune HTTP et WebSocket). */
export function sessionProblem(
  session: Pick<Session, 'expiresAt' | 'lastSeenAt'>,
  userActive: boolean,
  idleMinutes: number,
  now: number,
): SessionProblem | null {
  if (!userActive) return 'USER_INACTIVE';
  if (session.expiresAt.getTime() <= now) return 'EXPIRED';
  if (session.lastSeenAt.getTime() + idleMinutes * MINUTE_MS <= now) return 'IDLE_EXPIRED';
  return null;
}

export type SessionValidation =
  | { ok: true; session: Session; user: AuthenticatedUser }
  | { ok: false; reason: 'MISSING' | 'UNKNOWN' | 'IDLE_EXPIRED' | 'EXPIRED' | 'USER_INACTIVE' };

/**
 * Sessions serveur (research R7) : jeton aléatoire de 256 bits dans le cookie,
 * seul son haché HMAC-SHA256 est stocké. Expiration après inactivité et durée maximale.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  hashToken(token: string): string {
    return createHmac('sha256', this.config.sessionSecret).update(token).digest('hex');
  }

  async create(userId: string, ip: string | null): Promise<{ token: string; session: Session }> {
    const token = randomBytes(32).toString('base64url');
    const maxHours = await this.settings.get('sessionMaxHours');
    const session = await this.prisma.session.create({
      data: {
        id: this.hashToken(token),
        userId,
        ip,
        expiresAt: new Date(Date.now() + maxHours * 60 * MINUTE_MS),
      },
    });
    return { token, session };
  }

  async validate(token: string | undefined): Promise<SessionValidation> {
    if (!token) return { ok: false, reason: 'MISSING' };
    const session = await this.prisma.session.findUnique({
      where: { id: this.hashToken(token) },
      include: { user: true },
    });
    if (!session) return { ok: false, reason: 'UNKNOWN' };

    const now = Date.now();
    const problem = sessionProblem(session, session.user.active, await this.settings.get('sessionIdleMinutes'), now);
    if (problem) {
      if (problem === 'USER_INACTIVE') await this.revokeAllForUser(session.userId);
      else await this.revoke(session.id);
      return { ok: false, reason: problem };
    }
    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
    }

    const { user, ...sessionOnly } = session;
    return { ok: true, session: sessionOnly, user: await this.toAuthenticatedUser(user) };
  }

  /**
   * Revérifie une session déjà ouverte (connexions WebSocket) sans prolonger son activité.
   * Renvoie la raison de fin de session, ou null si elle reste valide.
   */
  async checkById(sessionId: string): Promise<'EXPIRED' | 'DEACTIVATED' | null> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!session) return 'EXPIRED';
    const problem = sessionProblem(session, session.user.active, await this.settings.get('sessionIdleMinutes'), Date.now());
    if (!problem) return null;
    if (problem === 'USER_INACTIVE') await this.revokeAllForUser(session.userId);
    else await this.revoke(session.id);
    return problem === 'USER_INACTIVE' ? 'DEACTIVATED' : 'EXPIRED';
  }

  async toAuthenticatedUser(user: User): Promise<AuthenticatedUser> {
    const rows = await this.prisma.rolePermission.findMany({ where: { role: user.role } });
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      active: user.active,
      mustChangePassword: user.mustChangePassword,
      permissions: permissionsFor(
        user.role,
        rows.map((r) => r.permission),
      ),
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  }

  async cookieMaxAgeMs(): Promise<number> {
    return (await this.settings.get('sessionMaxHours')) * 60 * MINUTE_MS;
  }
}
