/**
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (the Upstash REST client's
 * actual expected env var names — do not use REDIS_URL or any other alias here).
 *
 * Without both set, this module silently degrades to a per-process in-memory Map. That is
 * fine for plain caching (worst case: a cold cache), but NOT fine for OTP dedup/rate-limit
 * state, which needs to be shared across multiple serverless instances — each instance
 * would otherwise have its own view of "was this OTP already used". Setting the two
 * UPSTASH_* vars is a Round-3-later action item for the owner; nothing here fails or lies
 * about it in the meantime, it just quietly falls back.
 */

// In-Memory Fallback Cache Store for web frontend
const memoryCache = new Map<string, { value: any; expiresAt: number }>();

let redisClient: any = null;
let redisAttempted = false;

async function getRedis(): Promise<any | null> {
  if (redisAttempted) return redisClient;
  redisAttempted = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const { Redis } = await import("@upstash/redis");
      redisClient = new Redis({ url, token });
      return redisClient;
    } catch (err: any) {
      console.warn("⚠️ @upstash/redis not available or failed to initialize, using in-memory cache fallback.");
      redisClient = null;
      return null;
    }
  }
  return null;
}

/**
 * Retrieves a cached value from Upstash Redis (or in-memory fallback cache).
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedis();

  if (redis) {
    try {
      const data = await redis.get(key);
      if (data !== null && data !== undefined) return data as T;
    } catch (err: any) {
      console.warn("⚠️ Upstash Redis web cacheGet error:", err?.message || err);
    }
  }

  const item = memoryCache.get(key);
  if (item) {
    if (Date.now() < item.expiresAt) {
      return item.value as T;
    } else {
      memoryCache.delete(key);
    }
  }

  return null;
}

/**
 * Stores a value in Upstash Redis (or in-memory fallback cache) with a TTL in seconds.
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds = 3600): Promise<void> {
  const redis = await getRedis();

  if (redis) {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
      return;
    } catch (err: any) {
      console.warn("⚠️ Upstash Redis web cacheSet error:", err?.message || err);
    }
  }

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Invalidates a cache key.
 */
export async function cacheInvalidate(key: string): Promise<void> {
  const redis = await getRedis();

  if (redis) {
    try {
      await redis.del(key);
    } catch {}
  }

  memoryCache.delete(key);
}
