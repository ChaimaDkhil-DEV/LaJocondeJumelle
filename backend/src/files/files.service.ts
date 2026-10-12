import { Inject, Injectable } from '@nestjs/common';
import type { File as StoredFile } from '@prisma/client';
import { open, rm } from 'node:fs/promises';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { canReadRequest, canWriteInThread } from '../requests/domain/access-policy';
import { RequestPolicyLoader, toPolicyCategory, toPolicyRequest } from '../requests/request-policy.loader';
import { SettingsService } from '../settings/settings.service';
import { detectFileType, VOICE_CONTAINERS } from './file-signature';
import { FileStorageService } from './file-storage.service';
import type { FileResponse, UploadFileDto } from './files.dto';
import { processPhoto } from './photo-processing';
import { processVoice } from './voice-processing';

export interface UploadedTempFile {
  path: string;
  size: number;
  originalname: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readHead(path: string, bytes = 64): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Nom affiché d'une photo : nom d'origine nettoyé (sans chemin ni caractères de contrôle), extension .jpg. */
export function photoName(originalName: string): string {
  const base = (originalName.split(/[\\/]/).pop() ?? '')
    .replace(/[\p{Cc}"]/gu, '')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 200);
  return `${base || 'photo'}.jpg`;
}

export function toFileResponse(file: StoredFile): FileResponse {
  return {
    id: file.id,
    kind: file.kind,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    ...(file.durationSeconds !== null ? { durationSeconds: Number(file.durationSeconds) } : {}),
  };
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly settings: SettingsService,
    private readonly policies: RequestPolicyLoader,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Téléverse un fichier ; sans requestId, il reste provisoire jusqu'à son rattachement. */
  async upload(user: AuthenticatedUser, temp: UploadedTempFile, dto: UploadFileDto): Promise<FileResponse> {
    try {
      if (dto.requestId) await this.assertCanAttach(user, dto.requestId);

      if (dto.kind === 'PHOTO') return await this.uploadPhoto(user, temp, dto);
      if (dto.kind !== 'VOICE') {
        // Documents : acceptés avec le fil de discussion (US3).
        throw new AppException('FILE_TYPE_NOT_ALLOWED');
      }

      if (temp.size > (await this.settings.get('voiceMaxBytes'))) throw new AppException('FILE_TOO_LARGE');
      const detected = detectFileType(await readHead(temp.path));
      if (!detected || !VOICE_CONTAINERS.includes(detected)) throw new AppException('FILE_TYPE_NOT_ALLOWED');

      const voice = await processVoice(temp.path, {
        ffmpegPath: this.config.ffmpegPath,
        ffprobePath: this.config.ffprobePath,
        maxSeconds: await this.settings.get('voiceMaxSeconds'),
      });
      const storagePath = await this.storage.store(voice.path);

      const file = await this.prisma.file.create({
        data: {
          kind: 'VOICE',
          mimeType: voice.mimeType,
          originalName: 'message-vocal.m4a',
          sizeBytes: voice.sizeBytes,
          durationSeconds: voice.durationSeconds,
          storagePath,
          uploaderId: user.id,
          requestId: dto.requestId ?? null,
        },
      });
      return toFileResponse(file);
    } finally {
      await rm(temp.path, { force: true });
    }
  }

  /** Photo (appareil ou galerie) : taille ≤ attachmentMaxBytes, puis normalisation (photo-processing). */
  private async uploadPhoto(
    user: AuthenticatedUser,
    temp: UploadedTempFile,
    dto: UploadFileDto,
  ): Promise<FileResponse> {
    if (temp.size > (await this.settings.get('attachmentMaxBytes'))) throw new AppException('FILE_TOO_LARGE');
    const photo = await processPhoto(temp.path, { allowedTypes: await this.settings.get('allowedPhotoTypes') });
    const storagePath = await this.storage.store(photo.path);
    const file = await this.prisma.file.create({
      data: {
        kind: 'PHOTO',
        mimeType: photo.mimeType,
        originalName: photoName(temp.originalname),
        sizeBytes: photo.sizeBytes,
        storagePath,
        uploaderId: user.id,
        requestId: dto.requestId ?? null,
      },
    });
    return toFileResponse(file);
  }

  /**
   * Fichier lisible par l'utilisateur, sinon null : fichier provisoire → son auteur uniquement ;
   * fichier rattaché → mêmes droits que la demande parente.
   */
  async findReadable(user: AuthenticatedUser, fileId: string): Promise<StoredFile | null> {
    if (!UUID.test(fileId)) return null;
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return null;
    if (file.requestId === null) return file.uploaderId === user.id ? file : null;

    const request = await this.prisma.request.findUnique({ where: { id: file.requestId } });
    const category = request && (await this.policies.category(request.categoryId));
    if (!request || !category) return null;
    return canReadRequest(user, toPolicyRequest(request), toPolicyCategory(category)) ? file : null;
  }

  absolutePath(file: StoredFile): string {
    return this.storage.absolutePath(file.storagePath);
  }

  async logDenied(user: AuthenticatedUser, fileId: string, ip: string | null, route: string): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      actorId: user.id,
      targetType: 'File',
      targetId: fileId.slice(0, 64),
      ip,
      details: { reason: 'NOT_VISIBLE', route, method: 'GET', channel: 'http' },
    });
  }

  private async assertCanAttach(user: AuthenticatedUser, requestId: string): Promise<void> {
    const request = await this.prisma.request.findUnique({ where: { id: requestId } });
    const category = request && (await this.policies.category(request.categoryId));
    if (!request || !category || !canWriteInThread(user, toPolicyRequest(request), toPolicyCategory(category))) {
      throw new AppException('NOT_FOUND');
    }
  }
}
