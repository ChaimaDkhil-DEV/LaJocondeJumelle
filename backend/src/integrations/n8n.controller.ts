import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Post,
  Req,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { CommunicationChannel, CommunicationDeliveryStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { IntegrationRoute } from '../auth/integration-route.decorator';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { clientIp, requestPath } from '../common/request-info';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import {
  COMMUNICATION_APPROVED_EVENT,
  ParentCommunicationsService,
} from '../parent-communications/parent-communications.service';
import { nextDeliveryStatus, verifyBearer } from './domain/n8n-protocol';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Appels de n8n : jeton porteur égal au secret partagé (temps constant) ; refus journalisé ; sans n8n configuré, 401. */
@Injectable()
export class N8nGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (this.config.n8n && verifyBearer(req.headers.authorization, this.config.n8n.secret))
      return true;
    await this.audit.log('ACCESS_DENIED', {
      ip: clientIp(req),
      details: {
        reason: 'INTEGRATION_UNAUTHORIZED',
        route: requestPath(req),
        method: req.method,
        channel: 'http',
      },
    });
    throw new AppException('INTEGRATION_UNAUTHORIZED');
  }
}

const DELIVERY_STATUSES: readonly CommunicationDeliveryStatus[] = [
  'PENDING',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'RETRYING',
];

/** Compte rendu de livraison envoyé par n8n, rattaché à l'événement outbox reçu. */
export class DeliveryReportDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  communicationId!: string;

  @IsIn(['EMAIL', 'WHATSAPP'])
  channel!: CommunicationChannel;

  @IsIn(DELIVERY_STATUSES)
  status!: CommunicationDeliveryStatus;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  providerMessageId?: string;

  /** Erreur du fournisseur (tronquée à 500 caractères), sans donnée personnelle. */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().slice(0, 500) : value,
  )
  error?: string;
}

/**
 * Routes réservées à n8n (015, FR-010). n8n ne reçoit que des identifiants dans l'événement, puis
 * demande ici les informations minimales (coordonnées du destinataire selon les canaux activés, lien
 * vers l'espace parent), jamais la remarque ni le vocal ; il rapporte ensuite chaque livraison.
 */
@IntegrationRoute()
@UseGuards(N8nGuard)
@Controller('integrations/n8n')
export class N8nController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly communications: ParentCommunicationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('parent-communications/:id')
  async communication(@Param('id') id: string, @Req() req: Request) {
    const row = UUID.test(id)
      ? await this.prisma.parentCommunication.findFirst({
          where: { id, status: 'APPROVED', guardian: { active: true } },
          select: {
            id: true,
            decidedAt: true,
            student: { select: { firstName: true } },
            teacher: { select: { displayName: true } },
            guardian: { select: { firstName: true, lastName: true, email: true, phone: true } },
          },
        })
      : null;
    if (!row) throw new AppException('NOT_FOUND');
    const channels = this.communications.channelsFor(row.guardian);
    await this.audit.log('PARENT_COMMUNICATION_DELIVERY', {
      targetType: 'ParentCommunication',
      targetId: id,
      ip: clientIp(req),
      details: { event: 'DATA_READ', channels },
    });
    return {
      communicationId: row.id,
      recipient: {
        firstName: row.guardian.firstName,
        lastName: row.guardian.lastName,
        ...(channels.includes('EMAIL') ? { email: row.guardian.email } : {}),
        ...(channels.includes('WHATSAPP') ? { phone: row.guardian.phone } : {}),
      },
      student: row.student,
      teacher: row.teacher,
      channels,
      link: `${this.config.appOrigin}/messages-ecole/${row.id}`,
      approvedAt: row.decidedAt,
    };
  }

  /** Idempotent : un compte rendu répété ne change rien ; une livraison confirmée reste confirmée. */
  @Post('deliveries')
  @HttpCode(200)
  async delivery(@Body() dto: DeliveryReportDto, @Req() req: Request) {
    const event = await this.prisma.outboxEvent.findFirst({
      where: {
        id: dto.eventId,
        type: COMMUNICATION_APPROVED_EVENT,
        aggregateId: dto.communicationId,
        status: { in: ['SENT', 'PENDING'] },
      },
      select: { id: true },
    });
    if (!event) throw new AppException('NOT_FOUND');
    if (!this.config.parentCommunicationChannels.includes(dto.channel)) {
      throw new AppException('CHANNEL_DISABLED');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.parentCommunicationDelivery.upsert({
        where: {
          communicationId_channel: { communicationId: dto.communicationId, channel: dto.channel },
        },
        create: { communicationId: dto.communicationId, channel: dto.channel },
        update: {},
      });
      const next = nextDeliveryStatus(current.status, dto.status);
      if (!next.changed)
        return { channel: current.channel, status: current.status, changed: false };
      const updated = await tx.parentCommunicationDelivery.update({
        where: { id: current.id },
        data: {
          status: next.status,
          ...(next.attempt ? { attempts: { increment: 1 } } : {}),
          ...(dto.providerMessageId ? { providerMessageId: dto.providerMessageId } : {}),
          lastError:
            next.status === 'FAILED' || next.status === 'RETRYING' ? (dto.error ?? null) : null,
        },
      });
      await this.audit.log(
        'PARENT_COMMUNICATION_DELIVERY',
        {
          targetType: 'ParentCommunication',
          targetId: dto.communicationId,
          ip: clientIp(req),
          details: { event: 'REPORT', channel: dto.channel, from: current.status, to: next.status },
        },
        tx,
      );
      return { channel: updated.channel, status: updated.status, changed: true };
    });
    return result;
  }
}
