/**
 * Error tracking. Imported first by main.ts and the worker so Sentry can instrument
 * HTTP and PostgreSQL before they load. No personal data is sent (sendDefaultPii off).
 */
import * as Sentry from '@sentry/nestjs';

const dsn = process.env['SENTRY_DSN'];
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] ?? 'development',
    release: process.env['YUSR_RELEASE'] ?? process.env['GIT_SHA'],
    tracesSampleRate: Number(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? 0.1),
    sendDefaultPii: false,
  });
}
