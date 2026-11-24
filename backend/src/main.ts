import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppLogger } from './common/app-logger';
import { PrismaService } from './common/prisma.service';
import type { AppConfig } from './config/config';
import { APP_CONFIG } from './config/config.module';
import { assertNoEnvFileInProduction, loadEnvFile } from './config/load-env-file';
import { assertLeastPrivilege } from './database/runtime-role';

async function bootstrap(): Promise<void> {
  assertNoEnvFileInProduction();
  loadEnvFile();
  // Journaux JSON (une ligne par entrée), secrets masqués — T116.
  const app = await NestFactory.create(AppModule, { logger: new AppLogger() });
  const config = app.get<AppConfig>(APP_CONFIG);
  // Audit de sécurité R02 : jamais le compte propriétaire ni un superutilisateur en production.
  if (config.isProduction) await assertLeastPrivilege(app.get(PrismaService));
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.port);
}

void bootstrap();
