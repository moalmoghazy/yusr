import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { NextFunction, Response } from 'express';
import { problemFor } from './problem';
import type { AppRequest } from './request';

/**
 * Errors raised by the framework rather than an endpoint (unknown route, method not
 * allowed…) leave in the same problem+json shape the SDK parses. Endpoint errors never
 * reach this filter: dispatch() already turned them into responses.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response
        .status(status)
        .type('application/problem+json')
        .json({
          type: 'about:blank',
          title: exception.name,
          status,
          error: { code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', message: exception.message },
          requestId: request.requestId ?? null,
        });
      return;
    }

    const problem = problemFor(exception, request.requestId ?? null);
    if (problem.status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      Sentry.captureException(exception, { tags: { requestId: request.requestId ?? 'none' } });
    }
    for (const [name, value] of Object.entries(problem.headers)) response.setHeader(name, value);
    response.status(problem.status).json(problem.body);
  }
}

/** Express error middleware for the body parsers: malformed JSON (400) or too large (413). */
export function bodyParserErrors(error: unknown, request: AppRequest, response: Response, next: NextFunction): void {
  if (!error) return next();
  const status = (error as { status?: number }).status === 413 ? 413 : 400;
  response
    .status(status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: status === 413 ? 'Payload Too Large' : 'Bad Request',
      status,
      error: { code: 'VALIDATION_FAILED', message: status === 413 ? 'Request body is too large' : 'Request body is not valid JSON' },
      requestId: request.requestId ?? null,
    });
}
