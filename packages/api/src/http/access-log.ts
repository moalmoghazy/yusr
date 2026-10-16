import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './request';

/**
 * One structured line per request: method, path, status, duration, request id.
 * Query strings and bodies are never logged (they can carry tokens or personal data).
 */
export function accessLog(logger = new Logger('Access')) {
  return (request: AppRequest, response: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    response.on('finish', () => {
      if (request.path === '/health') return;
      logger.log(
        JSON.stringify({
          method: request.method,
          path: request.path,
          status: response.statusCode,
          ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
          requestId: request.requestId ?? null,
        }),
      );
    });
    next();
  };
}
