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

  /**
   * Thermal token printer (ESC/POS). Nothing here is secret and nothing is sent to the browser except the
   * non-sensitive summary from GET /print/status. Until PRINTER_DRIVER is set the API runs in BROWSER mode:
   * tokens are rendered server-side and the web app prints them through the browser instead.
   *
   *   PRINTER_DRIVER = DISABLED (default) | NETWORK | FILE | CONSOLE
   *     NETWORK  raw TCP to an Ethernet/Wi-Fi printer  -> PRINTER_HOST (+ PRINTER_PORT, default 9100)
   *     FILE     write raw bytes to a device/queue path -> PRINTER_DEVICE_PATH (e.g. /dev/usb/lp0, or a shared-printer path)
   *     CONSOLE  development only: prints the token text to the API log
   */
  printer: {
    driver: (process.env.PRINTER_DRIVER ?? 'DISABLED').toUpperCase(),
    host: process.env.PRINTER_HOST ?? '',
    port: parseInt(process.env.PRINTER_PORT ?? '9100', 10),
    devicePath: process.env.PRINTER_DEVICE_PATH ?? '',
    /** 80 (mm) = 48 characters per line, 58 (mm) = 32 characters per line. */
    paperWidthMm: process.env.PRINTER_PAPER_WIDTH === '58' ? 58 : 80,
    timeoutMs: parseInt(process.env.PRINTER_TIMEOUT_MS ?? '5000', 10),
    cut: (process.env.PRINTER_CUT ?? 'true') !== 'false',
    openDrawer: (process.env.PRINTER_OPEN_DRAWER ?? 'false') === 'true',
    copies: Math.min(Math.max(parseInt(process.env.PRINTER_COPIES ?? '1', 10) || 1, 1), 5),
    /** Shown at the bottom of every token. */
    footer: process.env.PRINTER_FOOTER ?? 'Thank you! Visit again',
  },

  isProduction: process.env.NODE_ENV === 'production',
};
