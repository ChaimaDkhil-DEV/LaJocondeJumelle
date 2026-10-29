import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Texte soumis aux propositions (spec 009) : description et transcription réunies par le navigateur. */
export class SuggestDto {
  @Transform(trim)
  @IsString({ message: 'Écrivez une description ou enregistrez un vocal.' })
  @MinLength(1, { message: 'Écrivez une description ou enregistrez un vocal.' })
  @MaxLength(4000, { message: 'Le texte ne doit pas dépasser 4 000 caractères.' })
  text!: string;

  /**
   * Catégorie choisie par l'utilisateur : elle n'est plus proposée, mais sert à proposer le
   * destinataire et la priorité. Ignorée si l'utilisateur ne peut pas créer dans cette catégorie.
   */
  @IsOptional()
  @IsUUID('all', { message: 'Catégorie invalide.' })
  categoryId?: string;
}
