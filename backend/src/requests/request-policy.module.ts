import { Module } from '@nestjs/common';
import { RequestPolicyLoader } from './request-policy.loader';

/** Chargeur des règles de catégorie, déclaré une seule fois et partagé (A13, R9). */
@Module({
  providers: [RequestPolicyLoader],
  exports: [RequestPolicyLoader],
})
export class RequestPolicyModule {}
