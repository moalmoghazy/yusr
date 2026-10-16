import { Global, Inject, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { SERVICES, createServices, type Services } from './app.services';
import { APP_CONFIG, loadConfig, type AppConfig } from './config/env';

const messagingLog = new Logger('Messaging');

/**
 * Builds the service graph once (app.services.ts) and shares it with every controller.
 * In-process, it also runs the outbox worker unless RUN_WORKER=false (then run
 * `pnpm --filter @yusr/api worker` as its own process), and closes pools on shutdown.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: SERVICES,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createServices(config, { log: (line) => messagingLog.log(line) }),
    },
  ],
  exports: [APP_CONFIG, SERVICES],
})
export class CoreModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Core');

  constructor(@Inject(SERVICES) private readonly services: Services) {}

  onApplicationBootstrap(): void {
    const { config } = this.services;
    if (config.runWorker) this.services.worker.start();
    this.logger.log(
      `${config.demo ? 'PUBLIC DEMO (memory data, simulated payments) ' : ''}storage=${config.storage} payments=${config.payments.mode} objects=${this.services.devStorage ? 'dev' : 's3'} worker=${config.runWorker ? 'in-process' : 'separate'} release=${config.release}`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.services.close();
  }
}
