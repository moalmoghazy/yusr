import './instrument';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SERVICES, type Services } from './app.services';
import { accessLog } from './http/access-log';
import { ProblemFilter, bodyParserErrors } from './http/problem.filter';
import { requestId } from './http/request-id.middleware';

/**
 * The configured API application, not yet listening. `main.ts` serves it on a port (Docker, Render,
 * any long-running host); `api/index.js` hands it requests as a Vercel Function.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, bufferLogs: true });
  const { config } = app.get<Services>(SERVICES);

  // Client IPs drive rate limits: only trust X-Forwarded-For from the configured proxies.
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(accessLog());
  // An API serves JSON only: nothing may be framed, scripted or embedded.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.enableCors({
    origin: config.corsOrigins,
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-receipt-token', 'x-request-id', 'x-yusr-channel', 'accept-language'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });

  // Webhooks and uploads keep their exact bytes (signatures, files); everything else is JSON or a form.
  app.use('/v1/webhooks', express.raw({ type: () => true, limit: '1mb' }));
  app.use('/dev-storage', express.raw({ type: () => true, limit: '20mb' }));
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(bodyParserErrors);

  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  return app;
}
