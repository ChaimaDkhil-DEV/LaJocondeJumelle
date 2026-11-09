import { Type } from 'class-transformer';
import { IsBoolean, IsObject, IsOptional, ValidateNested } from 'class-validator';

/** Catégories push : chacune facultative, booléenne (spec 014, D1). */
export class PushCategoriesDto {
  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @IsOptional()
  @IsBoolean()
  coverage?: boolean;

  @IsOptional()
  @IsBoolean()
  unfilled?: boolean;

  @IsOptional()
  @IsBoolean()
  attendance?: boolean;
}

/**
 * PATCH /api/notifications/preferences (contracts/http-api.md) : modification partielle ; au moins un
 * champ, contrôlé par le service. Tout autre champ est refusé (liste blanche globale).
 */
export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PushCategoriesDto)
  categories?: PushCategoriesDto;

  @IsOptional()
  @IsBoolean()
  urgentSound?: boolean;
}
