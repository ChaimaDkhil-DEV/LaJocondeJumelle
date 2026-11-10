import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { AppException } from '../common/errors';
import { clientIp, requestPath } from '../common/request-info';
import { UPLOAD_TMP_DIR } from '../files/files.controller';
import { AvatarService, type AvatarContext, type AvatarState } from './avatar.service';
import { UploadRateLimitGuard } from '../common/upload-rate-limit.guard';
import { ParentAllowed } from '../auth/parent-allowed.decorator';

/**
 * Plafond technique de réception : la limite métier (2 Mo) est vérifiée ensuite, avec un message
 * précis ; au-delà de ce plafond, la réception s'arrête (413).
 */
const AVATAR_UPLOAD_LIMIT = 5 * 1024 * 1024;

function contextOf(req: Request): AvatarContext {
  return { ip: clientIp(req), route: requestPath(req), method: req.method };
}

/** Photos de profil : lecture pour tout utilisateur connecté ; modification selon AvatarService. */
@Controller('users')
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {
    mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
  }

  /** Comptes qui ont une photo : l'interface affiche les autres avec l'avatar par défaut. */
  @ParentAllowed()
  @Get('avatars')
  list(@CurrentUser() user: AuthenticatedUser): Promise<Array<{ id: string; avatarUrl: string }>> {
    return this.avatars.list(user);
  }

  /** Image WebP 256 × 256. L'adresse est versionnée : mise en cache longue sans risque. */
  @ParentAllowed()
  @Get(':id/avatar')
  async read(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const path = (await this.avatars.visibleTo(user, id)) ? await this.avatars.file(id) : null;
    if (!path) throw new AppException('NOT_FOUND');
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('Content-Disposition', 'inline');
    // dotfiles: 'allow' : le chemin est construit par le serveur (jamais par le client) et FILES_DIR
    // peut contenir un dossier caché (ex. backend/.e2e-files) ; Express le refuserait sinon (500).
    await new Promise<void>((resolve, reject) => res.sendFile(path, { dotfiles: 'allow' }, (error) => (error ? reject(error) : resolve())));
  }

  /** Nouvelle photo (multipart, champ `file`) : JPG, PNG ou WebP, 2 Mo au plus. */
  @Post(':id/avatar')
  @HttpCode(200)
  @UseGuards(UploadRateLimitGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: UPLOAD_TMP_DIR, filename: (_req, _file, cb) => cb(null, randomUUID()) }),
      limits: { fileSize: AVATAR_UPLOAD_LIMIT, files: 1, fields: 0 },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<AvatarState> {
    if (!file) {
      throw new AppException('VALIDATION_ERROR', { fields: [{ field: 'file', messages: ['Choisissez une photo.'] }] });
    }
    return this.avatars.set(user, id, { path: file.path, size: file.size }, contextOf(req));
  }

  /** Retour à l'avatar par défaut. */
  @Delete(':id/avatar')
  reset(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<AvatarState> {
    return this.avatars.reset(user, id, contextOf(req));
  }
}
