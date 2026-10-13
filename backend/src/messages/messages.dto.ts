import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** POST /requests/:id/messages — contracts/rest-api.md §Fil de discussion. */
export class CreateMessageDto {
  /** Identifiant généré par le client : rend l'envoi idempotent (research R10). */
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(4000, { message: 'Le message ne doit pas dépasser 4 000 caractères.' })
  text?: string;

  @IsOptional()
  @IsUUID()
  voiceFileId?: string;

  /** Plafond technique ; la limite métier est le réglage attachmentMaxPerMessage. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  attachmentFileIds?: string[];
}

export class ListMessagesQuery {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
