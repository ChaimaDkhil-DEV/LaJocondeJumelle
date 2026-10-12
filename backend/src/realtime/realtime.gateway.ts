import { Inject, Logger } from '@nestjs/common';
import { WebSocketGateway, type OnGatewayConnection, type OnGatewayInit } from '@nestjs/websockets';
import { parse } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { AuditService } from '../audit/audit.service';
import { SESSION_COOKIE } from '../auth/session.guard';
import { SessionService } from '../auth/session.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { RealtimeService, sessionRoom, userRoom, type SocketData } from './realtime.service';

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function unauthenticated(): Error {
  const error = new Error('UNAUTHENTICATED') as Error & { data?: unknown };
  error.data = { code: 'UNAUTHENTICATED' };
  return error;
}

/**
 * Passerelle Socket.IO (research R9) : authentification à la poignée de main par le cookie de
 * session et l'en-tête Origin (refus journalisés), salle personnelle `user:{id}` uniquement.
 * Le client n'émet aucun événement métier : toutes les écritures passent par REST.
 */
@WebSocketGateway({ path: '/socket.io', serveClient: false })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server, (sessionId) => this.sessions.checkById(sessionId));

    server.use((socket, next) => {
      this.authenticate(socket)
        .then((data) => {
          socket.data = data;
          next();
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.message === 'UNAUTHENTICATED')) {
            this.logger.error(error instanceof Error ? error.message : String(error));
          }
          next(unauthenticated());
        });
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const data = socket.data as SocketData;
    await socket.join([userRoom(data.userId), sessionRoom(data.sessionId)]);
  }

  private async authenticate(socket: Socket): Promise<SocketData> {
    const ip = socket.handshake.address || null;
    if (originOf(socket.handshake.headers.origin) !== this.config.appOrigin) {
      await this.denied(ip, 'ORIGIN_MISMATCH');
      throw unauthenticated();
    }
    const token = parse(socket.handshake.headers.cookie ?? '')[SESSION_COOKIE];
    const result = await this.sessions.validate(token);
    if (!result.ok) {
      await this.denied(ip, 'UNAUTHENTICATED', result.reason);
      throw unauthenticated();
    }
    if (result.user.mustChangePassword) {
      await this.denied(ip, 'PASSWORD_CHANGE_REQUIRED');
      throw unauthenticated();
    }
    return { userId: result.user.id, sessionId: result.session.id };
  }

  private async denied(ip: string | null, reason: string, status?: string): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      ip,
      details: { reason, ...(status ? { status } : {}), route: '/socket.io', channel: 'socket' },
    });
  }
}
