import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_CAPTCHA_TOKEN_LENGTH } from './turnstile.service';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;

  /** Jeton Turnstile, contrôlé par CaptchaGuard ; ignoré si le CAPTCHA est désactivé. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CAPTCHA_TOKEN_LENGTH)
  captchaToken?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: 'Le nouveau mot de passe doit contenir au moins 12 caractères.' })
  @MaxLength(256)
  newPassword!: string;
}
