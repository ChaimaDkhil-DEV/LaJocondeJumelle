import { Injectable } from '@nestjs/common';
import type { Permission } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AdminContext } from '../users/users.service';
import { isSettingKey, settingError, SettingsService, type SettingKey, type Settings } from './settings.service';

/** Rôles dont les permissions sont paramétrables (le super administrateur a toujours tout). */
export const CONFIGURABLE_ROLES = ['EMPLOYEE', 'MANAGER'] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

/** Permissions attribuables à ces rôles ; l'administration et l'audit restent au super administrateur. */
export const CONFIGURABLE_PERMISSIONS: readonly Permission[] = [
  'REQUEST_CREATE',
  'PRIORITY_CHANGE_OWN',
  'PRIORITY_CHANGE_MANAGED',
  'REQUEST_REASSIGN',
];

export type RolePermissions = Record<ConfigurableRole, Permission[]>;

function invalid(fields: Array<{ field: string; messages: string[] }>): AppException {
  return new AppException('VALIDATION_ERROR', { fields });
}

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  getSettings(): Promise<Settings> {
    return this.settings.getAll();
  }

  /** Mise à jour partielle : tout réglage inconnu ou hors bornes refuse l'ensemble ; un audit par réglage modifié. */
  async updateSettings(body: Record<string, unknown>, ctx: AdminContext): Promise<Settings> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid([{ field: 'body', messages: ['Objet attendu.'] }]);
    const errors: Array<{ field: string; messages: string[] }> = [];
    for (const [key, value] of Object.entries(body)) {
      if (!isSettingKey(key)) errors.push({ field: key, messages: ['Réglage inconnu.'] });
      else {
        const error = settingError(key, value);
        if (error) errors.push({ field: key, messages: [error] });
      }
    }
    if (errors.length > 0) throw invalid(errors);

    const current = await this.settings.getAll();
    const changed = (Object.entries(body) as Array<[SettingKey, Settings[SettingKey]]>).filter(
      ([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value),
    );
    if (changed.length === 0) return current;

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of changed) {
        await this.settings.set(key, value, ctx.actor.id, tx);
        await this.audit.log(
          'SETTING_CHANGED',
          {
            actorId: ctx.actor.id,
            ip: ctx.ip,
            targetType: 'Setting',
            targetId: key,
            details: { key, before: { value: current[key] }, after: { value } },
          },
          tx,
        );
      }
    });
    // Le cache a pu être relu pendant la transaction : on l'invalide de nouveau après validation.
    this.settings.invalidate();
    return this.settings.getAll();
  }

  /** Réglages utiles à l'interface de tout utilisateur connecté (aucune donnée sensible). */
  async clientSettings(): Promise<Pick<Settings, 'voiceMaxSeconds' | 'attachmentMaxBytes' | 'attachmentMaxPerMessage' | 'draftsEnabled'>> {
    const s = await this.settings.getAll();
    return {
      voiceMaxSeconds: s.voiceMaxSeconds,
      attachmentMaxBytes: s.attachmentMaxBytes,
      attachmentMaxPerMessage: s.attachmentMaxPerMessage,
      draftsEnabled: s.draftsEnabled,
    };
  }

  async rolePermissions(): Promise<RolePermissions> {
    const rows = await this.prisma.rolePermission.findMany({ where: { role: { in: [...CONFIGURABLE_ROLES] } } });
    const result: RolePermissions = { EMPLOYEE: [], MANAGER: [] };
    for (const row of rows) result[row.role as ConfigurableRole].push(row.permission);
    for (const role of CONFIGURABLE_ROLES) result[role].sort();
    return result;
  }

  /** Remplace les permissions des deux rôles ; prises en compte dès la requête suivante des utilisateurs. */
  async replaceRolePermissions(body: Record<string, unknown>, ctx: AdminContext): Promise<RolePermissions> {
    const errors: Array<{ field: string; messages: string[] }> = [];
    const next = {} as RolePermissions;
    for (const key of Object.keys(body ?? {})) {
      if (!(CONFIGURABLE_ROLES as readonly string[]).includes(key)) errors.push({ field: key, messages: ['Rôle non paramétrable.'] });
    }
    for (const role of CONFIGURABLE_ROLES) {
      const value = body?.[role];
      if (
        !Array.isArray(value) ||
        !value.every((p) => typeof p === 'string' && CONFIGURABLE_PERMISSIONS.includes(p as Permission)) ||
        new Set(value).size !== value.length
      ) {
        errors.push({ field: role, messages: [`Liste de permissions parmi : ${CONFIGURABLE_PERMISSIONS.join(', ')}.`] });
      } else next[role] = [...(value as Permission[])].sort();
    }
    if (errors.length > 0) throw invalid(errors);

    const before = await this.rolePermissions();
    if (JSON.stringify(before) === JSON.stringify(next)) return before;
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role: { in: [...CONFIGURABLE_ROLES] } } });
      await tx.rolePermission.createMany({
        data: CONFIGURABLE_ROLES.flatMap((role) => next[role].map((permission) => ({ role, permission }))),
      });
      await this.audit.log(
        'ROLE_PERMISSIONS_CHANGED',
        { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'RolePermission', details: { before, after: next } },
        tx,
      );
    });
    return next;
  }
}
