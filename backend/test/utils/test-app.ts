import { Controller, Get, type INestApplication, type OnModuleDestroy, type OnModuleInit, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/common/prisma.service';

export const TEST_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:5173';

/** Route protégée minimale, utilisée pour tester les gardes globales indépendamment des user stories. */
@Controller('test-probe')
export class ProtectedProbeController {
  @Get()
  probe(): { ok: true } {
    return { ok: true };
  }
}

/** Fournisseur remplacé pour un test (par exemple un fournisseur d'assistance simulé). */
export interface ProviderOverride {
  provide: unknown;
  useValue: unknown;
}

/** Client Prisma de l'application sur le rôle d'exécution, avec le cycle de vie de PrismaService. */
class RuntimePrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * Démarre l'application Nest complète sur la base de test, avec la même configuration que main.ts.
 * Audit de sécurité R02 : comme en production, elle se connecte avec le rôle d'exécution
 * (RUNTIME_DATABASE_URL_TEST, créé par global-setup), jamais avec le compte propriétaire des tests.
 */
export async function createTestApp(extraControllers: Type[] = [], overrides: ProviderOverride[] = []): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  });
  const runtimeUrl = process.env.RUNTIME_DATABASE_URL_TEST;
  if (runtimeUrl) builder.overrideProvider(PrismaService).useValue(new RuntimePrismaService({ datasourceUrl: runtimeUrl }));
  for (const { provide, useValue } of overrides) builder.overrideProvider(provide).useValue(useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** Extrait la valeur du cookie `sid` d'une réponse supertest. */
export function sessionCookie(setCookie: string[] | string | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const sid = cookies.find((c) => c.startsWith('sid='));
  if (!sid) throw new Error('Cookie sid absent');
  return sid.split(';')[0];
}

/** Application à l'écoute sur un port libre (clients Socket.IO réels). */
export async function createListeningTestApp(): Promise<{ app: INestApplication; baseUrl: string }> {
  const app = await createTestApp();
  await app.listen(0);
  const address = app.getHttpServer().address() as { port: number };
  return { app, baseUrl: `http://localhost:${address.port}` };
}
