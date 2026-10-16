import type { Request } from 'express';
import type { RequestActor } from '../common/actor';

/** Express request after our middleware and guard ran. */
export interface AppRequest extends Request {
  actor?: RequestActor | null;
  requestId?: string;
  /** Raw bytes of the body, kept for webhook signature checks (NestFactory rawBody: true). */
  rawBody?: Buffer;
}
