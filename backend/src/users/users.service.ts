import { Injectable } from '@nestjs/common';
import { Prisma, type Role, type User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SessionService } from '../auth/session.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { CreateUserDto, UpdateUserDto } from './users.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Compte vu par l'administration : jamais de haché ni de mot de passe. */
export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  jobTitle: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}

const ADMIN_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  jobTitle: true,
  role: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** Champs modifiables tracés avant/après dans l'audit. */
const AUDITED_FIELDS = ['displayName', 'jobTitle', 'role', 'active'] as const;

export interface AdminContext {
  actor: AuthenticatedUser;
  ip: string | null;
}

/** Mot de passe provisoire : 12 octets aléatoires, 16 caractères base64url. */
function temporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

function invalid(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  list(): Promise<AdminUser[]> {
    return this.prisma.user.findMany({ select: ADMIN_USER_SELECT, orderBy: [{ active: 'desc' }, { displayName: 'asc' }] });
  }

  /** Crée un compte ; le mot de passe provisoire n'est renvoyé qu'ici, une seule fois. */
  async create(dto: CreateUserDto, ctx: AdminContext): Promise<{ user: AdminUser; temporaryPassword: string }> {
    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) {
      throw new AppException('CONFLICT', { fields: [{ field: 'username', messages: ['Cet identifiant est déjà utilisé.'] }] }, 'Cet identifiant est déjà utilisé.');
    }
    const password = temporaryPassword();
    let user: AdminUser;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username: dto.username,
            displayName: dto.displayName,
            jobTitle: dto.jobTitle ?? null,
            role: dto.role,
            passwordHash: await this.auth.hashPassword(password),
            mustChangePassword: true,
          },
          select: ADMIN_USER_SELECT,
        });
        await this.audit.log(
          'USER_CREATED',
          {
            actorId: ctx.actor.id,
            ip: ctx.ip,
            targetType: 'User',
            targetId: created.id,
            details: { after: { username: created.username, displayName: created.displayName, jobTitle: created.jobTitle, role: created.role } },
          },
          tx,
        );
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException('CONFLICT', undefined, 'Cet identifiant est déjà utilisé.');
      }
      throw error;
    }
    return { user, temporaryPassword: password };
  }

  /**
   * Modifie nom, fonction, rôle ou activation. La désactivation ferme immédiatement les sessions
   * et les connexions temps réel du compte. Le super administrateur ne peut ni se désactiver
   * ni perdre son rôle (il resterait sans administrateur).
   */
  async update(id: string, dto: UpdateUserDto, ctx: AdminContext): Promise<AdminUser> {
    const current = await this.find(id);
    if (current.id === ctx.actor.id) {
      if (dto.active === false) throw invalid('active', 'Vous ne pouvez pas désactiver votre propre compte.');
      if (dto.role !== undefined && dto.role !== 'SUPER_ADMIN') throw invalid('role', 'Vous ne pouvez pas retirer votre propre rôle de super administrateur.');
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const field of AUDITED_FIELDS) {
      const next = dto[field];
      if (next !== undefined && next !== current[field]) {
        before[field] = current[field];
        after[field] = next;
      }
    }
    if (Object.keys(after).length === 0) return this.toAdminUser(current);

    const deactivated = after.active === false;
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: after, select: ADMIN_USER_SELECT });
      if (deactivated) await tx.session.deleteMany({ where: { userId: id } });

      const otherFields = Object.keys(after).filter((f) => f !== 'active' || !deactivated);
      if (deactivated) {
        await this.audit.log('USER_DEACTIVATED', { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'User', targetId: id, details: { before: { active: true }, after: { active: false } } }, tx);
      }
      if (otherFields.length > 0) {
        await this.audit.log(
          'USER_UPDATED',
          {
            actorId: ctx.actor.id,
            ip: ctx.ip,
            targetType: 'User',
            targetId: id,
            details: { before: pick(before, otherFields), after: pick(after, otherFields) },
          },
          tx,
        );
      }
      return user;
    });
    if (deactivated) this.realtime.endUserSessions(id, 'DEACTIVATED');
    return updated;
  }

  /** Nouveau mot de passe provisoire (renvoyé une seule fois) ; toutes les sessions du compte sont fermées. */
  async resetPassword(id: string, ctx: AdminContext): Promise<{ temporaryPassword: string }> {
    const user = await this.find(id);
    if (user.id === ctx.actor.id) {
      throw invalid('id', 'Utilisez « Changer mon mot de passe » pour votre propre compte.');
    }
    const password = temporaryPassword();
    const passwordHash = await this.auth.hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.deleteMany({ where: { userId: id } });
      await this.audit.log('PASSWORD_RESET', { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'User', targetId: id }, tx);
    });
    this.realtime.endUserSessions(id, 'PASSWORD_RESET');
    return { temporaryPassword: password };
  }

  private async find(id: string): Promise<User> {
    const user = UUID.test(id) ? await this.prisma.user.findUnique({ where: { id } }) : null;
    if (!user) throw new AppException('NOT_FOUND');
    return user;
  }

  private toAdminUser(user: User): AdminUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      jobTitle: user.jobTitle,
      role: user.role,
      active: user.active,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    };
  }
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, source[k]]));
}
