import { Body, Controller, HttpCode, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { AppException } from '../common/errors';
import { clientIp, requestPath } from '../common/request-info';
import { MAX_UPLOAD_BYTES, UPLOAD_TMP_DIR } from '../files/files.controller';
import type { RequestContext } from '../requests/requests.service';
import { SuggestDto } from './assist.dto';
import { AssistService, type SuggestionResult } from './assist.service';

/** Assistance à la création des demandes (spec 009) : aucune écriture métier. */
@Controller('assist')
export class AssistController {
  constructor(private readonly assist: AssistService) {
    mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
  }

  @Post('suggestions')
  @HttpCode(200)
  suggest(@CurrentUser() user: AuthenticatedUser, @Body() dto: SuggestDto, @Req() req: Request): Promise<SuggestionResult> {
    return this.assist.suggest(user, dto.text, contextOf(req));
  }

  /** Vocal du formulaire (multipart, champ `file`), contrôlé comme POST /api/files puis effacé. */
  @Post('transcriptions')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: UPLOAD_TMP_DIR, filename: (_req, _file, cb) => cb(null, randomUUID()) }),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
    }),
  )
  transcribe(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<{ text: string }> {
    if (!file) {
      throw new AppException('VALIDATION_ERROR', { fields: [{ field: 'file', messages: ['Fichier manquant'] }] });
    }
    return this.assist.transcribe(user, { path: file.path, size: file.size, originalname: file.originalname }, contextOf(req));
  }
}

function contextOf(req: Request): RequestContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}
