import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { OriginGuard } from './origin.guard';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 5 }])],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    LoginThrottlerGuard,
    // Ordre des gardes globales : Origin (CSRF) puis session.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
