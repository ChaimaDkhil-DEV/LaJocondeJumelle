import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/** Champs de premier niveau autorisés dans `details` (liste blanche). */
const ALLOWED_DETAIL_KEYS = new Set([
  'reason',
  'route',
  'method',
  'channel',
  'username',
  'role',
  'status',
  'before',
  'after',
  'changes',
  'fields',
  'key',
  'categoryId',
  'requestId',
  'fileId',
  'permissions',
  // Couverture de classe
  'action',
  'forced',
  'groupId',
]);

/** Clés jamais conservées, à tout niveau : secrets et contenus de messages. */
const SENSITIVE_KEY = /pass(word)?|hash|token|secret|cookie|^sid$|^text$|^message$|^content$/i;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, nested]) => [key, scrub(nested)]),
    );
  }
  return value;
}

/** Ne conserve que des identifiants et des valeurs métier : jamais de mot de passe, jeton ni contenu de message. */
export function sanitizeAuditDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const kept = Object.entries(details).filter(
    ([key]) => ALLOWED_DETAIL_KEYS.has(key) && !SENSITIVE_KEY.test(key),
  );
  if (kept.length === 0) return undefined;
  return Object.fromEntries(kept.map(([key, value]) => [key, scrub(value)]));
}

export interface AuditEntry {
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string | null;
}

/** Journal d'audit en ajout seul (la base refuse UPDATE, DELETE et TRUNCATE). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    action: AuditAction,
    entry: AuditEntry = {},
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const details = sanitizeAuditDetails(entry.details);
    await tx.auditLog.create({
      data: {
        action,
        actorId: entry.actorId ?? null,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: details as Prisma.InputJsonValue | undefined,
        ip: entry.ip ?? null,
      },
    });
  }
}
