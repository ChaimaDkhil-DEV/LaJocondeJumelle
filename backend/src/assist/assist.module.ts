import { Module } from '@nestjs/common';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { SuperAdminGuard } from '../audit/super-admin.guard';
import { FilesModule } from '../files/files.module';
import { RequestPolicyModule } from '../requests/request-policy.module';
import { AdminGuidelinesController } from './admin-guidelines.controller';
import { AssistRateLimiter } from './assist-rate-limiter';
import { AssistController } from './assist.controller';
import { AssistService } from './assist.service';
import { GuidelinesService } from './guidelines.service';
import {
  SUGGESTION_PROVIDER,
  TRANSCRIPTION_PROVIDER,
  suggestionProviderFor,
  transcriptionProviderFor,
} from './providers/assist-providers';

/** Assistance IA à la création des demandes (spec 009) : fournisseurs, consignes, propositions. */
@Module({
  imports: [FilesModule, RequestPolicyModule],
  controllers: [AdminGuidelinesController, AssistController],
  providers: [
    AssistService,
    GuidelinesService,
    SuperAdminGuard,
    { provide: TRANSCRIPTION_PROVIDER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => transcriptionProviderFor(c.assist) },
    { provide: SUGGESTION_PROVIDER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => suggestionProviderFor(c.assist) },
    { provide: AssistRateLimiter, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new AssistRateLimiter(c.assist.rateLimit) },
  ],
})
export class AssistModule {}
