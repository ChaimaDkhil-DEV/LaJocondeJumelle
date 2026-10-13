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
  /** Catégories dont le compte est destinataire : sans catégorie, il ne peut être ni destinataire ni affecté. */
  recipientCategories: Array<{ id: string; name: string }>;
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
  recipientOf: { select: { category: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_SELECT }>;

function toAdminUser({ recipientOf, ...user }: AdminUserRow): AdminUser {
  return {
    ...user,
    recipientCategories: recipientOf.map((r) => r.category).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

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

  async list(): Promise<AdminUser[]> {
    const rows = await this.prisma.user.findMany({ select: ADMIN_USER_SELECT, orderBy: [{ active: 'desc' }, { displayName: 'asc' }] });
    return rows.map(toAdminUser);
  }

  /**
   * Crée un compte ; le mot de passe provisoire n'est renvoyé qu'ici, une seule fois.
   * Les catégories choisies le rendent immédiatement destinataire, donc affectable par leurs responsables.
   */
  async create(dto: CreateUserDto, ctx: AdminContext): Promise<{ user: AdminUser; temporaryPassword: string }> {
    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) {
      throw new AppException('CONFLICT', { fields: [{ field: 'username', messages: ['Cet identifiant est déjà utilisé.'] }] }, 'Cet identifiant est déjà utilisé.');
    }
    const categoryIds = [...(dto.recipientCategoryIds ?? [])].sort();
    await this.checkCategories(categoryIds);
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
            recipientOf: { create: categoryIds.map((categoryId) => ({ categoryId })) },
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
            details: {
              after: {
                username: created.username,
                displayName: created.displayName,
                jobTitle: created.jobTitle,
                role: created.role,
                recipientCategoryIds: categoryIds,
              },
            },
          },
          tx,
        );
        return toAdminUser(created);
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
   * Modifie nom, fonction, rôle, activation ou catégories destinataires. La désactivation ferme immédiatement les sessions
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
    const userData = { ...after };

    const categories = await this.recipientCategoryChange(current, dto);
    if (categories) {
      before.recipientCategoryIds = categories.before;
      after.recipientCategoryIds = categories.after;
    }
    if (Object.keys(after).length === 0) return this.get(id);

    const deactivated = after.active === false;
    await this.prisma.$transaction(async (tx) => {
      if (categories) {
        await tx.categoryRecipient.deleteMany({ where: { userId: id, categoryId: { notIn: categories.after } } });
        await tx.categoryRecipient.createMany({
          data: categories.after.map((categoryId) => ({ categoryId, userId: id })),
          skipDuplicates: true,
        });
      }
      if (Object.keys(userData).length > 0) await tx.user.update({ where: { id }, data: userData });
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
    });
    if (deactivated) this.realtime.endUserSessions(id, 'DEACTIVATED');
    return this.get(id);
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

  private async get(id: string): Promise<AdminUser> {
    return toAdminUser(await this.prisma.user.findUniqueOrThrow({ where: { id }, select: ADMIN_USER_SELECT }));
  }

  private async checkCategories(categoryIds: string[]): Promise<void> {
    if (categoryIds.length === 0) return;
    const found = await this.prisma.category.count({ where: { id: { in: categoryIds } } });
    if (found !== categoryIds.length) throw invalid('recipientCategoryIds', 'Une des catégories choisies est introuvable.');
  }

  /**
   * Catégories dont le compte devient (ou cesse d'être) destinataire ; null si inchangées.
   * Mêmes règles que l'édition des destinataires depuis la catégorie : compte actif, et l'employé
   * désigné pour l'affectation automatique ne peut pas être retiré.
   */
  private async recipientCategoryChange(user: User, dto: UpdateUserDto): Promise<{ before: string[]; after: string[] } | null> {
    if (dto.recipientCategoryIds === undefined) return null;
    const after = [...dto.recipientCategoryIds].sort();
    const current = await this.prisma.categoryRecipient.findMany({ where: { userId: user.id }, select: { categoryId: true } });
    const before = current.map((r) => r.categoryId).sort();
    if (sameIds(before, after)) return null;

    await this.checkCategories(after);
    const added = after.filter((c) => !before.includes(c));
    if (added.length > 0 && (dto.active ?? user.active) === false) {
      throw invalid('recipientCategoryIds', 'Un compte désactivé ne peut pas devenir destinataire d’une catégorie.');
    }
    const locked = await this.prisma.category.findFirst({
      where: { id: { in: before.filter((c) => !after.includes(c)) }, assignmentMode: 'AUTO', autoAssigneeId: user.id },
      select: { name: true },
    });
    if (locked) {
      throw invalid(
        'recipientCategoryIds',
        `Ce compte reçoit automatiquement les demandes de « ${locked.name} » : changez d’abord l’employé désigné de cette catégorie.`,
      );
    }
    return { before, after };
  }
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, source[k]]));
}
