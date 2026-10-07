import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // In development we warn instead of crashing so the API can still boot
    // for local exploration; production deployments must set these.
    // eslint-disable-next-line no-console
    console.warn(`[env] Missing environment variable: ${name}`);
    return '';
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:4000',

  mongoUri: required('MONGO_URI', 'mongodb://localhost:27017/hfc_ros'),
  /** Optional — when unset, caching is simply disabled (see config/redis.ts). Not required for local dev. */
  redisUrl: process.env.REDIS_URL,

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev_access_secret_change_me_32chars'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me_32chars'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER ?? 'MOCK',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev_webhook_secret',
  },

  /** Browser print settings. Direct ESC/POS output is paused; thermal layouts use a 58 mm roll. */
  printer: {
    driver: (process.env.PRINTER_DRIVER ?? 'DISABLED').toUpperCase(),
    host: process.env.PRINTER_HOST ?? '',
    port: parseInt(process.env.PRINTER_PORT ?? '9100', 10),
    devicePath: process.env.PRINTER_DEVICE_PATH ?? '',
    paperWidthMm: 58 as const,
    timeoutMs: parseInt(process.env.PRINTER_TIMEOUT_MS ?? '5000', 10),
    cut: (process.env.PRINTER_CUT ?? 'true') !== 'false',
    openDrawer: (process.env.PRINTER_OPEN_DRAWER ?? 'false') === 'true',
    copies: Math.min(Math.max(parseInt(process.env.PRINTER_COPIES ?? '1', 10) || 1, 1), 5),
    /** Shown at the bottom of every token. */
    footer: process.env.PRINTER_FOOTER ?? 'Thank you! Visit again',
  },

  isProduction: process.env.NODE_ENV === 'production',
};
