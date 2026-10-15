import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { AllowPendingPasswordChange } from './allow-pending-password-change.decorator';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { AuthService } from './auth.service';
import { toMeResponse, type AuthContext, type AuthenticatedUser, type MeResponse } from './auth.types';
import { CurrentAuth, CurrentUser } from './current-user.decorator';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { Public } from './public.decorator';
import { clientIp } from '../common/request-info';
import { SESSION_COOKIE } from './session.guard';
import { SessionService } from './session.service';

@Controller('auth')
@AllowPendingPasswordChange()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict' as const,
      path: '/',
    };
  }

  @Public()
  @UseGuards(LoginThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: MeResponse }> {
    const { token, user } = await this.auth.login(dto.username, dto.password, clientIp(req));
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge: await this.sessions.cookieMaxAgeMs() });
    return { user: toMeResponse(user) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth.user, auth.sessionId, clientIp(req));
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): MeResponse {
    return toMeResponse(user);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword(auth.user, auth.sessionId, dto.currentPassword, dto.newPassword, clientIp(req));
  }
}
