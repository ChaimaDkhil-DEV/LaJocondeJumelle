import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ServerTimeInterceptor } from './common/server-time.interceptor';
import { createValidationPipe } from './common/validation.pipe';

/** Configuration commune à main.ts et aux tests d'intégration. */
export function configureApp(app: INestApplication): void {
  // Adresse IP cliente derrière Caddy (X-Forwarded-For) : proxys de confiance configurables.
  (app as NestExpressApplication).set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ServerTimeInterceptor());

  // Contrat OpenAPI (types du frontend) ; non exposé en production.
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Demandes de travail – API')
        .setVersion('0.1.0')
        .addCookieAuth('sid')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
  }
}
