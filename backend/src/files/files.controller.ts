import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diskStorage } from 'multer';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { clientIp, requestPath } from '../auth/request-info';
import { AppException } from '../common/errors';
import { UploadFileDto, type FileResponse } from './files.dto';
import { FilesService } from './files.service';

/** Plafond technique de Multer ; les limites métier (réglages) sont vérifiées ensuite. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const UPLOAD_TMP_DIR = join(tmpdir(), 'ljj-uploads');

function contentDisposition(mimeType: string, name: string): string {
  const disposition = mimeType.startsWith('audio/') || mimeType.startsWith('image/') ? 'inline' : 'attachment';
  return `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`;
}

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {
    mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: UPLOAD_TMP_DIR, filename: (_req, _file, cb) => cb(null, randomUUID()) }),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    }),
  )
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadFileDto,
  ): Promise<FileResponse> {
    if (!file) {
      throw new AppException('VALIDATION_ERROR', { fields: [{ field: 'file', messages: ['Fichier manquant'] }] });
    }
    return this.files.upload(user, { path: file.path, size: file.size, originalname: file.originalname }, dto);
  }

  /** Téléchargement protégé : contrôle d'accès à chaque requête, Range pris en charge (Safari). */
  @Get(':id')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.files.findReadable(user, id);
    if (!file) {
      await this.files.logDenied(user, id, clientIp(req), requestPath(req));
      throw new AppException('NOT_FOUND');
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', contentDisposition(file.mimeType, file.originalName));

    await new Promise<void>((resolve, reject) => {
      res.sendFile(
        this.files.absolutePath(file),
        { cacheControl: false, lastModified: false, acceptRanges: true, dotfiles: 'allow' },
        (error) => (error && !res.headersSent ? reject(new AppException('NOT_FOUND')) : resolve()),
      );
    });
  }
}
