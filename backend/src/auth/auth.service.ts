import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { PushSubscriptionsService } from '../push/push-subscriptions.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { AuthenticatedUser } from './auth.types';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { SessionService } from './session.service';

/** Haché de référence : vérifier un identifiant inconnu prend le même temps qu'un identifiant connu. */
const DUMMY_HASH_PROMISE = hash('identifiant-inconnu-reference');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly attempts: LoginAttemptLimiter,
    private readonly push: PushSubscriptionsService,
  ) {}

  /** Argon2id avec les paramètres par défaut de la bibliothèque argon2. */
  hashPassword(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  async login(
    username: string,
    password: string,
    ip: string | null,
  ): Promise<{ token: string; user: AuthenticatedUser }> {
    const normalized = username.trim().toLowerCase();
    const attempt = this.attempts.reserve(ip, normalized);
    if (!attempt.allowed) {
      if (attempt.firstBlock) {
        await this.audit.log('ACCESS_DENIED', { ip, details: { reason: 'RATE_LIMITED', channel: 'http' } });
      }
      throw new AppException('RATE_LIMITED', undefined, 'Trop de tentatives. Patientez quelques minutes avant de réessayer.');
    }

    const user = await this.prisma.user.findUnique({ where: { username: normalized } });
    const valid = user
      ? await verify(user.passwordHash, password)
      : await verify(await DUMMY_HASH_PROMISE, password).then(() => false);

    if (!user || !valid || !user.active) {
      await this.audit.log('LOGIN_FAILURE', {
        actorId: user?.id ?? null,
        ip,
        details: { username: normalized, reason: !user ? 'UNKNOWN_USER' : !valid ? 'BAD_PASSWORD' : 'INACTIVE' },
      });
      throw new AppException('INVALID_CREDENTIALS');
    }

    this.attempts.succeed(ip, normalized);
    const { token } = await this.sessions.create(user.id, ip);
    await this.audit.log('LOGIN_SUCCESS', { actorId: user.id, ip });
    return { token, user: await this.sessions.toAuthenticatedUser(user) };
  }

  async logout(user: AuthenticatedUser, sessionId: string, ip: string | null): Promise<void> {
    await this.sessions.revoke(sessionId);
    // L'appareil de cette session ne reçoit plus de notifications push (spec 014, D8, SC-003).
    await this.push.deleteForSession(user.id, sessionId);
    this.realtime.endSession(sessionId, 'LOGOUT');
    await this.audit.log('LOGOUT', { actorId: user.id, ip });
  }

  /** Change le mot de passe, lève l'obligation de changement et ferme les autres sessions. */
  async changePassword(
    user: AuthenticatedUser,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
    ip: string | null,
  ): Promise<void> {
    const stored = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verify(stored.passwordHash, currentPassword))) {
      throw new AppException('VALIDATION_ERROR', {
        fields: [{ field: 'currentPassword', messages: ['Mot de passe actuel incorrect.'] }],
      });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.hashPassword(newPassword), mustChangePassword: false },
    });
    await this.sessions.revokeAllForUser(user.id, sessionId);
    // Comme les sessions : les autres appareils ne reçoivent plus de push (spec 014, NC-8b).
    await this.push.deleteOtherDevices(user.id, sessionId);
    await this.audit.log('PASSWORD_CHANGED', { actorId: user.id, targetType: 'User', targetId: user.id, ip });
  }
}
