import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { AuthenticatedUser } from './auth.types';
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

    const { token } = await this.sessions.create(user.id, ip);
    await this.audit.log('LOGIN_SUCCESS', { actorId: user.id, ip });
    return { token, user: await this.sessions.toAuthenticatedUser(user) };
  }

  async logout(user: AuthenticatedUser, sessionId: string, ip: string | null): Promise<void> {
    await this.sessions.revoke(sessionId);
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
    await this.audit.log('PASSWORD_CHANGED', { actorId: user.id, targetType: 'User', targetId: user.id, ip });
  }
}
