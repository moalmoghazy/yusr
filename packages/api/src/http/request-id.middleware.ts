import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './request';

/** Correlates logs, audit rows and support tickets: X-Request-Id in, same id out. */
export function requestId(request: AppRequest, response: Response, next: NextFunction): void {
  const incoming = request.header('x-request-id');
  const id = incoming && /^[A-Za-z0-9._-]{8,80}$/.test(incoming) ? incoming : randomUUID();
  request.requestId = id;
  response.setHeader('x-request-id', id);
  next();
}
