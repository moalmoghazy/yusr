import { Logger } from '@nestjs/common';
import { SERVICES, type Services } from './app.services';
import { createApp } from './bootstrap';

/** The API on a long-running host (Docker image, Render, a VM): `node dist/main.js`. */
async function main(): Promise<void> {
  const app = await createApp();
  const { config } = app.get<Services>(SERVICES);
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`Yusr API listening on ${config.urls.api} · OpenAPI at /v1/openapi.json`, 'Bootstrap');
}

void main();
