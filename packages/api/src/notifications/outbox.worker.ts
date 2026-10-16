/**
 * Transactional outbox worker. Events are written in the same transaction as the change
 * they describe, so a message is sent if — and only if — the change committed.
 * PostgreSQL hands each worker different rows (FOR UPDATE SKIP LOCKED), so several
 * workers can run side by side. Failures back off exponentially and stop after 8 tries.
 */
import type { Clock } from '../common/clock';
import type { Database } from '../db/ports';
import type { DonationsService } from '../donations/donations.service';
import type { Dispatcher } from './dispatcher';

const BACKOFF_SECONDS = [30, 120, 600, 1_800, 3_600, 3 * 3_600, 6 * 3_600, 12 * 3_600];

export interface WorkerLogger {
  error(message: string, context?: Record<string, unknown>): void;
}

export class OutboxWorker {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private lastExpiry = 0;

  constructor(
    private readonly db: Database,
    private readonly dispatcher: Dispatcher,
    private readonly donations: DonationsService,
    private readonly clock: Clock,
    private readonly logger: WorkerLogger = { error: (message, context) => console.error(message, context) },
  ) {}

  /** Processes one batch; returns how many events were handled. */
  async tick(batch = 50): Promise<number> {
    const now = this.clock.now();
    const events = await this.db.transaction((tx) => tx.outbox.claim(batch, now));
    for (const event of events) {
      try {
        if (this.dispatcher.handles(event.type)) await this.dispatcher.dispatch(event);
        await this.db.transaction((tx) => tx.outbox.markSent(event.id));
      } catch (error) {
        const delay = BACKOFF_SECONDS[event.attempts - 1];
        const retryAt = delay === undefined ? null : new Date(now.getTime() + delay * 1000);
        await this.db.transaction((tx) => tx.outbox.markFailed(event.id, (error as Error).message.slice(0, 500), retryAt));
        if (!retryAt) this.logger.error('Outbox event failed permanently', { id: event.id, type: event.type, error: (error as Error).message });
      }
    }
    // Housekeeping every five minutes: expire checkouts nobody completed.
    if (now.getTime() - this.lastExpiry > 5 * 60_000) {
      this.lastExpiry = now.getTime();
      await this.donations.expireStale().catch((error: Error) => this.logger.error('Expiring donations failed', { error: error.message }));
    }
    return events.length;
  }

  start(intervalMs = 2_000): void {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      try {
        const handled = await this.tick();
        this.timer = setTimeout(loop, handled > 0 ? 50 : intervalMs);
      } catch (error) {
        this.logger.error('Outbox tick failed', { error: (error as Error).message });
        this.timer = setTimeout(loop, intervalMs * 5);
      }
    };
    void loop();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }
}
