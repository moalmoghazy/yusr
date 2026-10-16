/**
 * The outbox worker as its own process (`pnpm --filter @yusr/api worker`), for deployments
 * that run the API with RUN_WORKER=false. Several workers can run side by side: events are
 * claimed with FOR UPDATE SKIP LOCKED, so each one is delivered by exactly one of them.
 */
import '../instrument';
import { createServices } from '../app.services';
import { loadConfig } from '../config/env';

const log = (level: 'info' | 'error', message: string, extra: Record<string, unknown> = {}) =>
  (level === 'error' ? console.error : console.log)(JSON.stringify({ level, message, ...extra, at: new Date().toISOString() }));

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.storage === 'memory') {
    log('error', 'The standalone worker needs PostgreSQL: in memory mode the API runs the worker itself');
    process.exit(1);
  }
  const services = await createServices(config);
  services.worker.start();
  log('info', 'outbox worker started', { release: config.release });

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log('info', 'outbox worker stopping', { signal });
    services.worker.stop();
    await services.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
}

main().catch((error: unknown) => {
  log('error', 'outbox worker failed to start', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
