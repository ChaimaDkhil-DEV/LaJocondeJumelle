import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppException, ERROR_CATALOG, type ErrorCode } from './errors';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'FILE_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'FILE_TYPE_NOT_ALLOWED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Erreur de l'analyseur de corps d'Express (corps trop gros, JSON illisible…) : ce n'est pas une HttpException,
 * mais elle porte un statut 4xx destiné au client (`expose`). Sans ce cas, elle partirait en 500.
 */
function clientErrorStatus(exception: unknown): number | null {
  if (!(exception instanceof Error)) return null;
  const { status, expose } = exception as Error & { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true ? status : null;
}

interface ErrorDescription {
  status: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Format d'erreur unique : { "error": { "code", "message", "details" } }.
 * Les erreurs inattendues sont journalisées et masquées derrière INTERNAL_ERROR.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const { status, code, message, details } = this.describe(exception, http.getRequest<Request>());
    response.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
  }

  private describe(exception: unknown, request: Request): ErrorDescription {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.userMessage,
        details: exception.details,
      };
    }
    if (exception instanceof ThrottlerException) {
      return { status: 429, code: 'RATE_LIMITED', message: ERROR_CATALOG.RATE_LIMITED.message };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
      return { status, code, message: ERROR_CATALOG[code].message };
    }
    const clientStatus = clientErrorStatus(exception);
    if (clientStatus !== null) {
      const code = STATUS_TO_CODE[clientStatus] ?? 'VALIDATION_ERROR';
      return { status: clientStatus, code, message: ERROR_CATALOG[code].message };
    }
    // Référence courte : relie le message vu par l'utilisateur à la ligne de journal, sans rien
    // exposer. La chaîne de requête (identifiants, filtres) n'est pas journalisée.
    const reference = randomUUID().slice(0, 8);
    const route = `${request?.method ?? '?'} ${(request?.url ?? '?').split('?')[0]}`;
    const detail = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
    this.logger.error(`[ref ${reference}] ${route} — ${detail}`);
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: ERROR_CATALOG.INTERNAL_ERROR.message,
      details: { reference },
    };
  }
}
