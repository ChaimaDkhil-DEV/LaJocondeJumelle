import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { AppException } from '../common/errors';
import { buildPage, decodeCursor, parseLimit } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';

export class ListNotificationsQuery {
  @IsOptional()
  @IsIn(['true', 'false'])
  unread?: 'true' | 'false';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

/** `{ ids }` ou `{ all: true }`, exclusivement. */
export class MarkReadDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Notifications de l'utilisateur, les plus récentes d'abord, avec le nombre de non lues. */
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsQuery) {
    const limit = parseLimit(query.limit);
    const where: Record<string, unknown> = { userId: user.id, ...(query.unread === 'true' ? { readAt: null } : {}) };
    if (query.cursor) {
      const { createdAt, id } = decodeCursor(query.cursor);
      where.OR = [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }];
    }
    const [rows, unreadTotal] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: { request: { select: { id: true, reference: true, title: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    const page = buildPage(rows, limit);
    return {
      items: page.items.map((n) => ({
        id: n.id,
        type: n.type,
        priority: n.priority,
        request: n.request,
        createdAt: n.createdAt,
        readAt: n.readAt,
      })),
      nextCursor: page.nextCursor,
      unreadTotal,
    };
  }

  /** Marque comme lues des notifications de l'utilisateur (jamais celles d'un autre). */
  @Post('read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Body() dto: MarkReadDto): Promise<void> {
    const byIds = Boolean(dto.ids?.length);
    if (byIds === (dto.all === true) || (!byIds && dto.all !== true)) {
      throw new AppException('VALIDATION_ERROR', {
        fields: [{ field: 'ids', messages: ['Indiquez soit des identifiants, soit « all: true ».'] }],
      });
    }
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(byIds ? { id: { in: dto.ids } } : {}) },
      data: { readAt: new Date() },
    });
  }
}
