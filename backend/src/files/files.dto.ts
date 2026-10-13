import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { FileKind } from '@prisma/client';

export const FILE_KINDS: readonly FileKind[] = ['VOICE', 'PHOTO', 'DOCUMENT'];

export class UploadFileDto {
  @IsIn(FILE_KINDS)
  kind!: FileKind;

  @IsOptional()
  @IsUUID()
  requestId?: string;
}

export interface FileResponse {
  id: string;
  kind: FileKind;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
}
