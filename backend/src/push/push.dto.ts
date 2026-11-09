import { Type } from 'class-transformer';
import { IsDefined, IsObject, IsString, MaxLength, ValidateNested } from 'class-validator';
import { MAX_ENDPOINT_LENGTH } from './domain/push-endpoint';

/** Clés de l'abonnement, telles que les donne PushSubscription.toJSON() dans le navigateur. */
export class PushSubscriptionKeysDto {
  @IsString()
  @MaxLength(128)
  p256dh!: string;

  @IsString()
  @MaxLength(64)
  auth!: string;
}

/**
 * Abonnement de l'appareil courant (PUT /api/push/subscriptions, contracts/http-api.md). Le format est
 * contrôlé ici ; l'hôte autorisé et la taille réelle des clés le sont par validatePushSubscription.
 */
export class UpsertPushSubscriptionDto {
  @IsString()
  @MaxLength(MAX_ENDPOINT_LENGTH)
  endpoint!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}
