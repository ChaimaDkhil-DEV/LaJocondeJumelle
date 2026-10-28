import { Controller, Get, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

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

/** Démarre l'application Nest complète sur la base de test, avec la même configuration que main.ts. */
export async function createTestApp(extraControllers: Type[] = [], overrides: ProviderOverride[] = []): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  });
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
