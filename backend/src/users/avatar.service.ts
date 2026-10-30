import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AvatarType, Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { processAvatar } from './avatar-processing';

export interface AvatarState {
  avatarUrl: string | null;
  avatarType: AvatarType;
}

export interface AvatarContext {
  ip: string | null;
  route: string;
  method: string;
}

/** Rôles qui peuvent changer la photo d'un autre utilisateur (décision 2026-10-29). */
const AVATAR_EDITOR_ROLES: readonly Role[] = ['SUPER_ADMIN', 'ADMIN'];

/** Chacun change sa propre photo ; super administrateur et admins, celle des autres aussi. */
export function canEditAvatar(actor: Pick<AuthenticatedUser, 'id' | 'role'>, targetId: string): boolean {
  return actor.id === targetId || AVATAR_EDITOR_ROLES.includes(actor.role);
}

/** Version d'une photo, lue dans son adresse (« …/avatar?v=3f9c2a1b ») ; null sinon. */
export function avatarVersion(avatarUrl: string | null): string | null {
  const match = avatarUrl ? /[?&]v=([0-9a-f]{16})$/.exec(avatarUrl) : null;
  return match ? match[1] : null;
}

/**
 * Photos de profil. Le fichier vit dans FILES_DIR/avatars, nommé par l'utilisateur et une version
 * aléatoire : l'adresse change à chaque photo (cache du navigateur sans risque d'image périmée),
 * et l'ancien fichier est supprimé. Sans photo, l'interface calcule l'avatar par défaut.
 */
@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Chemin absolu : res.sendFile refuse un chemin relatif (FILES_DIR=./data/files en développement). */
  private dir(): string {
    return resolve(this.config.filesDir, 'avatars');
  }

  private pathOf(userId: string, version: string): string {
    return join(this.dir(), `${userId}-${version}.webp`);
  }

  /** Utilisateur ciblé, après contrôle des droits (refus journalisé). */
  private async target(actor: AuthenticatedUser, userId: string, ctx: AvatarContext) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, avatarUrl: true } });
    if (!user) throw new AppException('NOT_FOUND');
    if (!canEditAvatar(actor, userId)) {
      await this.audit.log('ACCESS_DENIED', {
        actorId: actor.id,
        targetType: 'User',
        targetId: userId,
        ip: ctx.ip,
        details: { reason: 'AVATAR_NOT_ALLOWED', route: ctx.route, method: ctx.method, channel: 'http' },
      });
      throw new AppException('FORBIDDEN', undefined, 'Vous ne pouvez changer que votre propre photo.');
    }
    return user;
  }

  /** Changement fait pour quelqu'un d'autre : tracé (jamais l'image elle-même). */
  private async logChange(actor: AuthenticatedUser, userId: string, change: 'set' | 'reset', ctx: AvatarContext): Promise<void> {
    if (actor.id === userId) return;
    await this.audit.log('USER_UPDATED', {
      actorId: actor.id,
      targetType: 'User',
      targetId: userId,
      ip: ctx.ip,
      details: { fields: ['avatar'], action: change },
    });
  }

  /** Suppression best effort : un fichier déjà absent n'empêche rien. */
  private async removeVersion(userId: string, avatarUrl: string | null): Promise<void> {
    const version = avatarVersion(avatarUrl);
    if (!version) return;
    await rm(this.pathOf(userId, version), { force: true }).catch((error: unknown) =>
      this.logger.warn(`Ancienne photo non supprimée (${userId}) : ${error instanceof Error ? error.name : 'erreur'}`),
    );
  }

  async set(actor: AuthenticatedUser, userId: string, temp: { path: string; size: number }, ctx: AvatarContext): Promise<AvatarState> {
    try {
      const user = await this.target(actor, userId, ctx);
      const image = await processAvatar(temp.path, temp.size);
      const version = randomBytes(8).toString('hex');
      await mkdir(this.dir(), { recursive: true });
      await writeFile(this.pathOf(userId, version), image);
      const state: AvatarState = { avatarUrl: `/api/users/${userId}/avatar?v=${version}`, avatarType: 'CUSTOM' };
      try {
        await this.prisma.user.update({ where: { id: userId }, data: state });
      } catch (error) {
        // Base non mise à jour : le nouveau fichier ne servirait jamais.
        await rm(this.pathOf(userId, version), { force: true });
        throw error;
      }
      await this.removeVersion(userId, user.avatarUrl);
      await this.logChange(actor, userId, 'set', ctx);
      return state;
    } finally {
      await rm(temp.path, { force: true });
    }
  }

  /** Retour à l'avatar par défaut : la photo est supprimée. */
  async reset(actor: AuthenticatedUser, userId: string, ctx: AvatarContext): Promise<AvatarState> {
    const user = await this.target(actor, userId, ctx);
    const state: AvatarState = { avatarUrl: null, avatarType: 'DEFAULT' };
    await this.prisma.user.update({ where: { id: userId }, data: state });
    await this.removeVersion(userId, user.avatarUrl);
    await this.logChange(actor, userId, 'reset', ctx);
    return state;
  }

  /** Fichier de la photo actuelle ; null si l'utilisateur n'en a pas (ou fichier perdu). */
  async file(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true, avatarType: true } });
    const version = user?.avatarType === 'CUSTOM' ? avatarVersion(user.avatarUrl) : null;
    if (!version) return null;
    const path = this.pathOf(userId, version);
    return (await stat(path).catch(() => null)) ? path : null;
  }

  /** Photos personnalisées de tous les comptes, pour l'affichage partout (quelques dizaines). */
  async list(): Promise<Array<{ id: string; avatarUrl: string }>> {
    const rows = await this.prisma.user.findMany({
      where: { avatarType: 'CUSTOM', avatarUrl: { not: null } },
      select: { id: true, avatarUrl: true },
    });
    return rows.map((r) => ({ id: r.id, avatarUrl: r.avatarUrl! }));
  }
}
