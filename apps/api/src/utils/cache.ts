import { getRedisClient } from '../config/redis';

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // any cache failure = cache miss, never a request failure
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // best-effort - a failed cache write should never fail the request that triggered it
  }
}

export async function cacheInvalidate(keyOrPrefix: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    if (keyOrPrefix.endsWith('*')) {
      const keys = await client.keys(keyOrPrefix);
      if (keys.length > 0) await client.del(...keys);
    } else {
      await client.del(keyOrPrefix);
    }
  } catch {
    // best-effort - see cacheSet
  }
}
