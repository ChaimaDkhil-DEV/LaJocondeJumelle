import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/** Ajoute l'en-tête X-Server-Time (ISO 8601), utilisé par les comptes à rebours côté client. */
@Injectable()
export class ServerTimeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('X-Server-Time', new Date().toISOString());
    }
    return next.handle();
  }
}
