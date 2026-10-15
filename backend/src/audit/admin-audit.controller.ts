import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditAction, type Prisma } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { buildPage, decodeCursor, parseLimit, type Page } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { SuperAdminGuard } from './super-admin.guard';

export class AuditQuery {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface AuditEntryView {
  id: string;
  action: AuditAction;
  actor: { id: string; displayName: string } | null;
  targetType: string | null;
  targetId: string | null;
  details: Prisma.JsonValue;
  ip: string | null;
  createdAt: Date;
}

/** Fin de période : une date seule couvre toute la journée. */
function endOf(to: string): Prisma.DateTimeFilter {
  if (to.length === 10) {
    const next = new Date(`${to}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return { lt: next };
  }
  return { lte: new Date(to) };
}

/** Journal d'audit (FR-030) : consultation seule, aucune route d'écriture. */
@Controller('admin/audit')
@UseGuards(SuperAdminGuard)
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: AuditQuery): Promise<Page<AuditEntryView>> {
    const limit = parseLimit(query.limit);
    const and: Prisma.AuditLogWhereInput[] = [];
    if (query.actorId) and.push({ actorId: query.actorId });
    if (query.action) and.push({ action: query.action });
    if (query.from) and.push({ createdAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ createdAt: endOf(query.to) });
    if (query.cursor) {
      const c = decodeCursor(query.cursor);
      and.push({ OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] });
    }
    const rows = await this.prisma.auditLog.findMany({
      where: { AND: and },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = buildPage(rows, limit);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((r) => ({
        id: r.id,
        action: r.action,
        actor: r.actor,
        targetType: r.targetType,
        targetId: r.targetId,
        details: r.details,
        ip: r.ip,
        createdAt: r.createdAt,
      })),
    };
  }
}
