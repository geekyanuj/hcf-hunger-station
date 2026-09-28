import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

let client: Redis | null = null;
let hasWarnedUnavailable = false;

/**
 * Redis is used for one concrete purpose in Part 3: caching the public menu
 * read (`GET /menu`), which is by far the highest-traffic, cheapest-to-cache
 * endpoint in the system (every customer visit hits it, and it changes only
 * when staff edit the menu). It is NOT wired in "because the spec mentioned
 * it" — see docs/PART3.md for the reasoning, and for how the same client can
 * be extended to back express-rate-limit's store in a multi-instance
 * deployment.
 *
 * Connection failures never crash the API: every cache read/write is wrapped
 * so a missing/unreachable Redis simply falls back to querying MongoDB
 * directly (a strictly slower but fully correct degraded mode) — this
 * mirrors the "graceful degradation over hard failure" pattern used for the
 * mocked notification providers elsewhere in Part 3.
 */
export function getRedisClient(): Redis | null {
  if (!env.redisUrl) return null;
  if (client) return client;

  client = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // don't keep retrying forever - fall back to DB reads instead
  });

  client.on('error', (err) => {
    if (!hasWarnedUnavailable) {
      logger.warn(`Redis unavailable, caching disabled (falling back to direct DB reads): ${err.message}`);
      hasWarnedUnavailable = true;
    }
  });

  client.connect().catch(() => {
    // handled by the 'error' listener above
  });

  return client;
}
