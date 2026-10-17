/**
 * Composition root: builds every framework-free service from the configuration.
 * NestJS registers what this returns (core.module.ts); tests and scripts can call it
 * directly. PostgreSQL, Redis, S3 and the real gateways are loaded lazily, so memory
 * mode (YUSR_STORAGE=memory) runs with none of them installed or reachable.
 */
import { AdminQueries, TeamService } from './admin/admin.queries';
import { AuthService } from './auth/auth.service';
import { MeQueries } from './auth/me.queries';
import { OAuthVerifier } from './auth/oauth';
import { DEFAULT_OTP, OtpService, type OtpSender } from './auth/otp.service';
import { CasesService } from './cases/cases.service';
import { VerificationService } from './cases/verification.service';
import { FieldCipher } from './common/cipher';
import { systemClock, type Clock } from './common/clock';
import { newId, type IdGenerator } from './common/ids';
import { MemoryKv, RedisKv, type KeyValueStore, type RedisLike } from './common/kv';
import { RateLimiter } from './common/rate-limit';
import type { AppConfig } from './config/env';
import { MemoryDatabase } from './db/memory';
import type { Database } from './db/ports';
import { seedDemo } from './db/seed';
import { DocumentsService } from './documents/documents.service';
import { DevStorage, type ObjectStorage } from './documents/storage';
import { DEFAULT_CHECKOUT_WINDOWS, DonationsService } from './donations/donations.service';
import { PayoutsService } from './finance/payouts.service';
import { RefundsService } from './finance/refunds.service';
import { BaserowClient } from './integrations/baserow';
import { Analytics } from './integrations/posthog';
import { SlackNotifier } from './integrations/slack';
import { HttpChannels, LogChannels, type Channels } from './notifications/channels';
import { Dispatcher } from './notifications/dispatcher';
import { OutboxWorker } from './notifications/outbox.worker';
import { RefreshingFx, StaticFx, type FxProvider } from './payments/fx';
import type { PaymentGateway } from './payments/gateway';
import { FawryGateway } from './payments/gateways/fawry.gateway';
import { InstapayGateway } from './payments/gateways/instapay.gateway';
import { MoyasarGateway } from './payments/gateways/moyasar.gateway';
import { PaymobGateway } from './payments/gateways/paymob.gateway';
import { SimulatedGateway } from './payments/gateways/simulated.gateway';
import { StripeGateway } from './payments/gateways/stripe.gateway';
import { GatewayRegistry } from './payments/registry';

export interface Services {
  config: AppConfig;
  clock: Clock;
  ids: IdGenerator;
  db: Database;
  kv: KeyValueStore;
  limiter: RateLimiter;
  cipher: FieldCipher;
  storage: ObjectStorage;
  /** Set when no object storage is configured: the API serves /dev-storage itself. */
  devStorage: DevStorage | null;
  channels: Channels & OtpSender;
  fx: FxProvider;
  gateways: GatewayRegistry;
  simulators: ReadonlyMap<string, SimulatedGateway>;
  auth: AuthService;
  me: MeQueries;
  cases: CasesService;
  verification: VerificationService;
  donations: DonationsService;
  payouts: PayoutsService;
  refunds: RefundsService;
  documents: DocumentsService;
  admin: AdminQueries;
  team: TeamService;
  dispatcher: Dispatcher;
  worker: OutboxWorker;
  /** Pings the database and the key-value store (readiness probe). */
  ready(): Promise<{ database: boolean; cache: boolean }>;
  close(): Promise<void>;
}

async function createDatabase(config: AppConfig, clock: Clock, cipher: FieldCipher): Promise<{ db: Database; close: () => Promise<void> }> {
  if (config.storage === 'memory') {
    const db = new MemoryDatabase(() => clock.now());
    await db.seed((tx) => seedDemo(tx, { now: clock.now(), cipher }).then(() => undefined));
    return { db, close: async () => undefined };
  }
  const [{ Pool }, { drizzle }, { DrizzleDatabase }, { schema }] = await Promise.all([
    import('pg'),
    import('drizzle-orm/node-postgres'),
    import('./db/drizzle'),
    import('./db/schema'),
  ]);
  const pool = new Pool({ connectionString: config.databaseUrl, max: 20, idleTimeoutMillis: 30_000, application_name: 'yusr-api' });
  return { db: new DrizzleDatabase(drizzle(pool, { schema })), close: () => pool.end() };
}

async function createKv(config: AppConfig, clock: Clock): Promise<{ kv: KeyValueStore; close: () => Promise<void> }> {
  if (!config.redisUrl) return { kv: new MemoryKv(clock), close: async () => undefined };
  const { Redis } = await import('ioredis');
  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2, enableAutoPipelining: true });
  return { kv: new RedisKv(redis as unknown as RedisLike), close: async () => void (await redis.quit()) };
}

async function createStorage(config: AppConfig, clock: Clock): Promise<ObjectStorage> {
  if (!config.storageBuckets) return new DevStorage(config.urls.api, { now: () => clock.now().getTime() });
  const { S3Storage } = await import('./documents/s3.storage');
  const buckets = config.storageBuckets;
  return new S3Storage({
    endpoint: buckets.endpoint,
    region: buckets.region,
    accessKeyId: buckets.accessKeyId,
    secretAccessKey: buckets.secretAccessKey,
    buckets: { private: buckets.privateBucket, public: buckets.publicBucket },
    publicBaseUrl: buckets.publicBaseUrl,
  });
}

function createGateways(config: AppConfig): { gateways: GatewayRegistry; simulators: Map<string, SimulatedGateway> } {
  const payments = config.payments;
  const simulators = new Map<string, SimulatedGateway>();
  const list: PaymentGateway[] = [new InstapayGateway(payments.instapay)];
  if (payments.mode === 'simulated') {
    for (const provider of ['paymob', 'fawry', 'stripe', 'moyasar'] as const) {
      const gateway = new SimulatedGateway(provider, { apiBaseUrl: config.urls.api, secret: payments.simulatorSecret });
      simulators.set(provider, gateway);
      list.push(gateway);
    }
  } else {
    if (payments.paymob) list.push(new PaymobGateway(payments.paymob));
    if (payments.fawry) list.push(new FawryGateway(payments.fawry));
    if (payments.stripe) list.push(new StripeGateway(payments.stripe));
    if (payments.moyasar) list.push(new MoyasarGateway(payments.moyasar));
  }
  return { gateways: new GatewayRegistry(list), simulators };
}

export async function createServices(config: AppConfig, options: { clock?: Clock; ids?: IdGenerator; log?: (line: string) => void } = {}): Promise<Services> {
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? newId;
  const cipher = new FieldCipher(config.crypto.dataKeyBase64);
  const [{ db, close: closeDb }, { kv, close: closeKv }, storage] = await Promise.all([
    createDatabase(config, clock, cipher),
    createKv(config, clock),
    createStorage(config, clock),
  ]);
  const limiter = new RateLimiter(kv);
  const messaging = config.messaging;
  const channels: Channels & OtpSender =
    messaging.email || messaging.sms || messaging.whatsapp
      ? new HttpChannels({
          email: messaging.email ?? undefined,
          sms: messaging.sms ?? undefined,
          whatsapp: messaging.whatsapp ?? undefined,
        })
      : new LogChannels(options.log);
  const fx: FxProvider = config.payments.fxFeedUrl ? new RefreshingFx({ url: config.payments.fxFeedUrl }) : new StaticFx();
  if (fx instanceof RefreshingFx) fx.start();
  const { gateways, simulators } = createGateways(config);

  const otp = new OtpService(kv, limiter, channels, clock, { ...DEFAULT_OTP, pepper: config.auth.otpPepper, revealCode: config.demo });
  const oauth = new OAuthVerifier({ clientIds: { google: config.auth.googleClientIds, apple: config.auth.appleClientIds } }, clock);
  const auth = new AuthService({
    db,
    otp,
    oauth,
    cipher,
    clock,
    ids,
    config: {
      jwtSecrets: config.auth.jwtSecrets,
      activeKeyId: config.auth.activeKeyId,
      issuer: config.auth.issuer,
      audience: 'yusr-api',
      accessTtlSeconds: config.auth.accessTtlSeconds,
      refreshTtlDays: config.auth.refreshTtlDays,
    },
  });
  const cases = new CasesService({ db, cipher, clock, ids, config: { nationalIdPepper: config.crypto.nationalIdPepper } });
  const verification = new VerificationService({ db, cases, clock, ids });
  const webHost = new URL(config.urls.web).host;
  const donations = new DonationsService({
    db,
    gateways,
    fx,
    clock,
    ids,
    config: {
      publicApiUrl: config.urls.api,
      publicWebUrl: config.urls.web,
      allowedReturnHosts: [webHost, new URL(config.urls.admin).host],
      appScheme: 'yusr',
      receiptSecret: config.crypto.receiptSecret,
      feePolicy: 'case_absorbs',
      checkoutWindowMs: DEFAULT_CHECKOUT_WINDOWS,
    },
  });
  const payouts = new PayoutsService({ db, clock, ids });
  const refunds = new RefundsService({ db, gateways, clock, ids });
  const documents = new DocumentsService({ db, storage, limiter, clock, ids });
  const admin = new AdminQueries({ db, cases, donations, fx, clock });
  const team = new TeamService(db);
  const me = new MeQueries({ db, clock, chatwootHmacToken: config.ops.chatwootHmacToken });
  const dispatcher = new Dispatcher({
    db,
    channels,
    slack: new SlackNotifier(config.ops.slack),
    baserow: new BaserowClient(config.ops.baserow),
    analytics: new Analytics(config.ops.posthog),
    links: { web: config.urls.web, admin: config.urls.admin },
    clock: () => clock.now(),
  });
  const worker = new OutboxWorker(db, dispatcher, donations, clock);

  return {
    config,
    clock,
    ids,
    db,
    kv,
    limiter,
    cipher,
    storage,
    devStorage: storage instanceof DevStorage ? storage : null,
    channels,
    fx,
    gateways,
    simulators,
    auth,
    me,
    cases,
    verification,
    donations,
    payouts,
    refunds,
    documents,
    admin,
    team,
    dispatcher,
    worker,
    async ready() {
      const [database, cache] = await Promise.all([
        db.read.reports.caseCounts().then(
          () => true,
          () => false,
        ),
        kv.set('health:ping', '1', { ttlSeconds: 5 }).then(
          () => true,
          () => false,
        ),
      ]);
      return { database, cache };
    },
    async close() {
      worker.stop();
      if (fx instanceof RefreshingFx) fx.stop();
      await Promise.allSettled([closeDb(), closeKv()]);
    },
  };
}

export const SERVICES = Symbol('SERVICES');
