import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Typed configuration from environment variables (see .env.example). Parsed once at
 * boot; a missing secret in production stops the process with a clear message
 * instead of failing on the first payment.
 *
 * The repository's development secrets are public, so they are accepted only on a developer's
 * machine: in production, or whenever the API talks to a database that is not on this machine, every
 * secret must be set (YUSR_ALLOW_DEV_SECRETS=true overrides this for a throwaway staging stack).
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  /** Build identifier (git SHA or version) reported by /health and to Sentry. */
  release: string;
  port: number;
  /** Express "trust proxy": which hops may set X-Forwarded-For (client IPs drive rate limits). */
  trustProxy: string;
  storage: 'postgres' | 'memory';
  /**
   * A public demo (YUSR_DEMO=true): seeded data in memory and the payment simulator only, allowed to
   * run with NODE_ENV=production on a free host. Refused with a real database, so it can never touch
   * real donors or real money.
   */
  demo: boolean;
  urls: { api: string; web: string; admin: string };
  corsOrigins: string[];
  /**
   * Shared secret of the website and control hub servers (YUSR_EDGE_SECRET). A request that carries it
   * in x-yusr-edge-secret may name the visitor's IP in x-yusr-client-ip, so rate limits count visitors
   * rather than the Next.js server. Null: those headers are ignored.
   */
  edgeSecret: string | null;
  databaseUrl: string;
  redisUrl: string | null;
  auth: {
    jwtSecrets: Record<string, string>;
    activeKeyId: string;
    issuer: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    otpPepper: string;
    /** Country calling codes (without +) that may receive sign-in codes (YUSR_OTP_COUNTRY_CODES). */
    otpCountryCodes: string[];
    /** Sign-in codes the whole platform may send per hour (YUSR_OTP_HOURLY_BUDGET), against SMS pumping. */
    otpHourlyBudget: number;
    googleClientIds: string[];
    appleClientIds: string[];
  };
  crypto: { dataKeyBase64: string; nationalIdPepper: string; receiptSecret: string };
  payments: {
    mode: 'live' | 'simulated';
    paymob: { secretKey: string; publicKey: string; hmacSecret: string; integrations: { card: number; wallet: number; applePay?: number } } | null;
    fawry: { baseUrl: string; merchantCode: string; secureKey: string } | null;
    stripe: { secretKey: string; publishableKey: string; webhookSecret: string } | null;
    moyasar: { secretKey: string; webhookToken: string } | null;
    instapay: { ipa: string; accountName: string };
    simulatorSecret: string;
    fxFeedUrl: string | null;
  };
  storageBuckets: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    privateBucket: string;
    publicBucket: string;
    publicBaseUrl: string;
  } | null;
  messaging: {
    email: { apiKey: string; from: string } | null;
    sms: { url: string; token: string } | null;
    whatsapp: { phoneNumberId: string; token: string } | null;
    expoAccessToken: string | null;
  };
  ops: {
    slack: { fieldOps?: string; finance?: string };
    baserow: { url: string; token: string; visitsTableId: string } | null;
    chatwootHmacToken: string | null;
    posthog: { key: string; host: string } | null;
    sentryDsn: string | null;
  };
  runWorker: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {}

export function loadConfig(env: Env = process.env): AppConfig {
  const nodeEnv = (env['NODE_ENV'] ?? 'development') as AppConfig['nodeEnv'];
  const production = nodeEnv === 'production';
  const missing: string[] = [];

  const get = (name: string) => {
    const value = env[name]?.trim();
    return value ? value : undefined;
  };
  /** Required in production; a clearly fake development default otherwise. */
  const secret = (name: string, devDefault: string) => {
    const value = get(name);
    if (value) return value;
    if (strictSecrets) missing.push(name);
    return devDefault;
  };
  const list = (name: string) =>
    (get(name) ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  const int = (name: string, fallback: number) => {
    const value = get(name);
    const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) throw new ConfigError(`${name} must be a number`);
    return parsed;
  };
  const group = <T>(names: readonly string[], build: () => T): T | null => (names.every((name) => get(name)) ? build() : null);

  const storage = get('YUSR_STORAGE') === 'memory' ? 'memory' : 'postgres';
  const demo = get('YUSR_DEMO') === 'true';
  if (demo && storage !== 'memory') throw new ConfigError('YUSR_DEMO=true needs YUSR_STORAGE=memory: a demo never uses a real database');
  // Development defaults are public (they are in this repository): only a database on this machine may use them.
  const remoteDatabase = storage === 'postgres' && !isLocalDatabase(get('DATABASE_URL'));
  const strictSecrets = production || (remoteDatabase && get('YUSR_ALLOW_DEV_SECRETS') !== 'true');
  // RENDER_EXTERNAL_URL is set by Render (https://<service>.onrender.com).
  const apiUrl = get('PUBLIC_API_URL') ?? get('RENDER_EXTERNAL_URL') ?? `http://localhost:${int('PORT', 4000)}`;
  const paymob = group(['PAYMOB_SECRET_KEY', 'PAYMOB_PUBLIC_KEY', 'PAYMOB_HMAC_SECRET', 'PAYMOB_INTEGRATION_CARD', 'PAYMOB_INTEGRATION_WALLET'], () => ({
    secretKey: get('PAYMOB_SECRET_KEY')!,
    publicKey: get('PAYMOB_PUBLIC_KEY')!,
    hmacSecret: get('PAYMOB_HMAC_SECRET')!,
    integrations: {
      card: int('PAYMOB_INTEGRATION_CARD', 0),
      wallet: int('PAYMOB_INTEGRATION_WALLET', 0),
      ...(get('PAYMOB_INTEGRATION_APPLE_PAY') ? { applePay: int('PAYMOB_INTEGRATION_APPLE_PAY', 0) } : {}),
    },
  }));
  const anyGateway = Boolean(paymob || get('FAWRY_MERCHANT_CODE') || get('STRIPE_SECRET_KEY') || get('MOYASAR_SECRET_KEY'));
  const mode: 'live' | 'simulated' = !demo && (get('PAYMENTS_MODE') === 'live' || (anyGateway && get('PAYMENTS_MODE') !== 'simulated')) ? 'live' : 'simulated';

  const jwtSecrets: Record<string, string> = { k1: secret('JWT_SECRET', 'dev-only-jwt-secret-change-me') };
  if (get('JWT_SECRET_PREVIOUS')) jwtSecrets['k0'] = get('JWT_SECRET_PREVIOUS')!;

  const config: AppConfig = {
    nodeEnv,
    release: get('YUSR_RELEASE') ?? get('GIT_SHA') ?? 'dev',
    port: int('PORT', 4000),
    trustProxy: get('TRUST_PROXY') ?? 'loopback, linklocal, uniquelocal',
    storage,
    demo,
    urls: { api: apiUrl, web: get('PUBLIC_WEB_URL') ?? 'http://localhost:3000', admin: get('PUBLIC_ADMIN_URL') ?? 'http://localhost:3001' },
    corsOrigins: list('CORS_ORIGINS').length ? list('CORS_ORIGINS') : ['http://localhost:3000', 'http://localhost:3001'],
    edgeSecret: get('YUSR_EDGE_SECRET') ?? null,
    databaseUrl: storage === 'postgres' ? secret('DATABASE_URL', 'postgres://yusr:yusr@localhost:5432/yusr') : '',
    redisUrl: storage === 'postgres' ? (get('REDIS_URL') ?? 'redis://localhost:6379') : null,
    auth: {
      jwtSecrets,
      activeKeyId: 'k1',
      issuer: get('JWT_ISSUER') ?? apiUrl,
      accessTtlSeconds: int('ACCESS_TOKEN_TTL_SECONDS', 900),
      refreshTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 30),
      otpPepper: secret('OTP_PEPPER', 'dev-only-otp-pepper'),
      otpCountryCodes: list('YUSR_OTP_COUNTRY_CODES').length ? list('YUSR_OTP_COUNTRY_CODES').map((code) => code.replace(/^\+/, '')) : ['20', '966'],
      otpHourlyBudget: int('YUSR_OTP_HOURLY_BUDGET', 1_000),
      googleClientIds: list('GOOGLE_CLIENT_IDS'),
      appleClientIds: list('APPLE_CLIENT_IDS'),
    },
    crypto: {
      dataKeyBase64: secret('DATA_KEY_BASE64', Buffer.alloc(32, 7).toString('base64')),
      nationalIdPepper: secret('NATIONAL_ID_PEPPER', 'dev-only-national-id-pepper'),
      receiptSecret: secret('RECEIPT_TOKEN_SECRET', 'dev-only-receipt-secret'),
    },
    payments: {
      mode,
      paymob,
      fawry: group(['FAWRY_MERCHANT_CODE', 'FAWRY_SECURE_KEY'], () => ({
        baseUrl: get('FAWRY_BASE_URL') ?? 'https://atfawry.fawrystaging.com',
        merchantCode: get('FAWRY_MERCHANT_CODE')!,
        secureKey: get('FAWRY_SECURE_KEY')!,
      })),
      stripe: group(['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'], () => ({
        secretKey: get('STRIPE_SECRET_KEY')!,
        publishableKey: get('STRIPE_PUBLISHABLE_KEY')!,
        webhookSecret: get('STRIPE_WEBHOOK_SECRET')!,
      })),
      moyasar: group(['MOYASAR_SECRET_KEY', 'MOYASAR_WEBHOOK_TOKEN'], () => ({
        secretKey: get('MOYASAR_SECRET_KEY')!,
        webhookToken: get('MOYASAR_WEBHOOK_TOKEN')!,
      })),
      instapay: { ipa: get('INSTAPAY_IPA') ?? 'yusr@instapay', accountName: get('INSTAPAY_ACCOUNT_NAME') ?? 'Yusr Foundation' },
      // The simulator signs its own checkout links and webhooks inside this process, so where the public
      // default is not acceptable (production, public demo, shared database) an unset secret is random per boot.
      simulatorSecret: get('SIMULATOR_SECRET') ?? (production || remoteDatabase ? randomBytes(32).toString('base64url') : 'dev-only-simulator-secret'),
      fxFeedUrl: get('FX_FEED_URL') ?? null,
    },
    storageBuckets: group(['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'], () => ({
      endpoint: get('S3_ENDPOINT')!,
      region: get('S3_REGION') ?? 'auto',
      accessKeyId: get('S3_ACCESS_KEY_ID')!,
      secretAccessKey: get('S3_SECRET_ACCESS_KEY')!,
      privateBucket: get('S3_PRIVATE_BUCKET') ?? 'yusr-documents',
      publicBucket: get('S3_PUBLIC_BUCKET') ?? 'yusr-public',
      publicBaseUrl: get('S3_PUBLIC_BASE_URL') ?? 'https://files.yusr.example',
    })),
    messaging: {
      email: group(['EMAIL_API_KEY'], () => ({ apiKey: get('EMAIL_API_KEY')!, from: get('EMAIL_FROM') ?? 'Yusr <receipts@yusr.example>' })),
      sms: group(['SMS_PROVIDER_URL', 'SMS_PROVIDER_TOKEN'], () => ({ url: get('SMS_PROVIDER_URL')!, token: get('SMS_PROVIDER_TOKEN')! })),
      whatsapp: group(['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TOKEN'], () => ({
        phoneNumberId: get('WHATSAPP_PHONE_NUMBER_ID')!,
        token: get('WHATSAPP_TOKEN')!,
      })),
      expoAccessToken: get('EXPO_ACCESS_TOKEN') ?? null,
    },
    ops: {
      slack: { fieldOps: get('SLACK_FIELD_OPS_WEBHOOK'), finance: get('SLACK_FINANCE_WEBHOOK') },
      baserow: group(['BASEROW_TOKEN', 'BASEROW_VISITS_TABLE_ID'], () => ({
        url: get('BASEROW_URL') ?? 'https://api.baserow.io',
        token: get('BASEROW_TOKEN')!,
        visitsTableId: get('BASEROW_VISITS_TABLE_ID')!,
      })),
      chatwootHmacToken: get('CHATWOOT_HMAC_TOKEN') ?? null,
      posthog: group(['POSTHOG_KEY'], () => ({ key: get('POSTHOG_KEY')!, host: get('POSTHOG_HOST') ?? 'https://eu.i.posthog.com' })),
      sentryDsn: get('SENTRY_DSN') ?? null,
    },
    runWorker: get('RUN_WORKER') !== 'false',
  };

  if (production && !demo && config.payments.mode === 'simulated') missing.push('a payment gateway (PAYMOB_*, FAWRY_*, STRIPE_* or MOYASAR_*)');
  if (production && !demo && config.storage === 'memory')
    throw new ConfigError('YUSR_STORAGE=memory is for development only (or a public demo: YUSR_DEMO=true)');
  if (production && !demo && !config.storageBuckets) missing.push('S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY');
  // Without a provider sign-in codes would only be printed to the log.
  if (production && !demo && !config.messaging.sms && !config.messaging.whatsapp)
    missing.push('an SMS or WhatsApp provider for sign-in codes (SMS_PROVIDER_URL + SMS_PROVIDER_TOKEN, or WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_TOKEN)');
  if (config.auth.otpCountryCodes.some((code) => !/^[1-9]\d{0,3}$/.test(code)))
    throw new ConfigError('YUSR_OTP_COUNTRY_CODES must be calling codes, e.g. 20,966');
  if (config.auth.otpHourlyBudget < 1) throw new ConfigError('YUSR_OTP_HOURLY_BUDGET must be at least 1');
  if (missing.length && strictSecrets && !production)
    throw new ConfigError(
      `Missing configuration: ${missing.join(', ')} (DATABASE_URL is not on this machine, so the development secrets are refused; YUSR_ALLOW_DEV_SECRETS=true overrides this)`,
    );
  if (missing.length) throw new ConfigError(`Missing configuration: ${missing.join(', ')}`);
  return config;
}

/** True for a PostgreSQL URL on this machine (or no URL: the development default is localhost). */
export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return true;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  return isIP(host) === 4 && host.startsWith('127.');
}

export const APP_CONFIG = Symbol('APP_CONFIG');
