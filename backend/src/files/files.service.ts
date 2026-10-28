import { Inject, Injectable } from '@nestjs/common';
import type { RequestKind, File as StoredFile } from '@prisma/client';
import { open, rm } from 'node:fs/promises';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { SettingsService } from '../settings/settings.service';
import type { RequestFileAccess } from './file-access';
import { detectFileType, VOICE_CONTAINERS } from './file-signature';
import { FileStorageService } from './file-storage.service';
import type { FileResponse, UploadFileDto } from './files.dto';
import { documentName, validateDocument } from './document-validation';
import { processPhoto } from './photo-processing';
import { processVoice, type ProcessedVoice } from './voice-processing';

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
  /** Décision d'accès par type de demande, fournie par chaque domaine (R8) ; fermé par défaut. */
  private readonly access = new Map<RequestKind, RequestFileAccess>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  registerAccess(kind: RequestKind, access: RequestFileAccess): void {
    if (this.access.has(kind)) throw new Error(`Accès aux fichiers déjà enregistré pour ${kind}`);
    this.access.set(kind, access);
  }

  /** Téléverse un fichier ; sans requestId, il reste provisoire jusqu'à son rattachement. */
  async upload(user: AuthenticatedUser, temp: UploadedTempFile, dto: UploadFileDto): Promise<FileResponse> {
    try {
      if (dto.requestId) await this.assertCanAttach(user, dto.requestId);

      if (dto.kind === 'PHOTO') return await this.uploadPhoto(user, temp, dto);
      if (dto.kind === 'DOCUMENT') return await this.uploadDocument(user, temp, dto);

      const voice = await this.prepareVoice(temp);
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

  /**
   * Contrôles d'un vocal (taille, signature, durée) puis conversion AAC/MP4. Le fichier téléversé
   * est supprimé ; le fichier converti (`path`) revient à l'appelant, qui le stocke ou l'efface.
   * Réutilisé par la transcription (spec 009), qui ne conserve rien.
   */
  async prepareVoice(temp: UploadedTempFile): Promise<ProcessedVoice> {
    if (temp.size > (await this.settings.get('voiceMaxBytes'))) throw new AppException('FILE_TOO_LARGE');
    const detected = detectFileType(await readHead(temp.path));
    if (!detected || !VOICE_CONTAINERS.includes(detected)) throw new AppException('FILE_TYPE_NOT_ALLOWED');
    return processVoice(temp.path, {
      ffmpegPath: this.config.ffmpegPath,
      ffprobePath: this.config.ffprobePath,
      maxSeconds: await this.settings.get('voiceMaxSeconds'),
    });
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

  /** Document joint (PDF par défaut) : taille ≤ attachmentMaxBytes, type réel vérifié, conservé tel quel. */
  private async uploadDocument(
    user: AuthenticatedUser,
    temp: UploadedTempFile,
    dto: UploadFileDto,
  ): Promise<FileResponse> {
    if (temp.size > (await this.settings.get('attachmentMaxBytes'))) throw new AppException('FILE_TOO_LARGE');
    const { mimeType } = await validateDocument(temp.path, {
      allowedTypes: await this.settings.get('allowedDocumentTypes'),
    });
    const storagePath = await this.storage.store(temp.path);
    const file = await this.prisma.file.create({
      data: {
        kind: 'DOCUMENT',
        mimeType,
        originalName: documentName(temp.originalname),
        sizeBytes: temp.size,
        storagePath,
        uploaderId: user.id,
        requestId: dto.requestId ?? null,
      },
    });
    return toFileResponse(file);
  }

  /**
   * Fichier lisible par l'utilisateur, sinon null : fichier provisoire → son auteur uniquement ;
   * fichier rattaché → décision du domaine de la demande parente (registre, fermé par défaut).
   */
  async findReadable(user: AuthenticatedUser, fileId: string): Promise<StoredFile | null> {
    if (!UUID.test(fileId)) return null;
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return null;
    if (file.requestId === null) return file.uploaderId === user.id ? file : null;

    const request = await this.prisma.request.findUnique({ where: { id: file.requestId } });
    const access = request && this.access.get(request.kind);
    if (!request || !access) return null;
    return (await access.canRead(user, file, request)) ? file : null;
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
    const access = request && this.access.get(request.kind);
    if (!request || !access || !(await access.canAttach(user, request))) throw new AppException('NOT_FOUND');
  }
}
