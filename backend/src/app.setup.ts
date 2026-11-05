import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ServerTimeInterceptor } from './common/server-time.interceptor';
import { createValidationPipe } from './common/validation.pipe';
import type { AppConfig } from './config/config';
import { APP_CONFIG } from './config/config.module';

/** Configuration commune à main.ts et aux tests d'intégration. */
export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  // Adresse IP cliente derrière Caddy (X-Forwarded-For) : proxys de confiance configurables.
  (app as NestExpressApplication).set('trust proxy', config.trustProxy);
  app.setGlobalPrefix('api');
  // En-têtes de sécurité même sans Caddy (dev, tests, autre hébergement). En production l'API ne sert que
  // du JSON, des fichiers et des CSV : aucune ressource à charger. Hors production la CSP est laissée
  // de côté pour l'interface Swagger (scripts et styles en ligne).
  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction
        ? { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } }
        : false,
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ServerTimeInterceptor());

  // Contrat OpenAPI (types du frontend) ; non exposé en production.
  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('La Joconde Jumelle – API')
        .setVersion('0.1.0')
        .addCookieAuth('sid')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
  }
}
