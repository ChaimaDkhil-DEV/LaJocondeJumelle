import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppLogger } from './common/app-logger';
import type { AppConfig } from './config/config';
import { APP_CONFIG } from './config/config.module';
import { loadEnvFile } from './config/load-env-file';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  // Journaux JSON (une ligne par entrée), secrets masqués — T116.
  const app = await NestFactory.create(AppModule, { logger: new AppLogger() });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(app.get<AppConfig>(APP_CONFIG).port);
}

void bootstrap();
