// In-Memory Fallback Cache Store (for environments without Upstash Redis credentials or package)
const memoryCache = new Map<string, { value: any; expiresAt: number }>();

let redisClient: any = null;
let redisAttempted = false;

async function getRedis(): Promise<any | null> {
  if (redisAttempted) return redisClient;
  redisAttempted = true;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
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
      console.warn("⚠️ Upstash Redis cacheGet error:", err?.message || err);
    }
  }

  // Fallback to memory cache
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
      console.warn("⚠️ Upstash Redis cacheSet error:", err?.message || err);
    }
  }

  // Fallback to memory cache
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Invalidates (deletes) a cache key or keys matching a pattern.
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

/**
 * Invalidates every cache entry whose key starts with `prefix`.
 *
 * Vehicle and pricing cache keys embed their filter arguments
 * (e.g. `vehicles:{"kind":"bike"}:true`), so there is no single key to delete after
 * an edit. Without this, a price change stayed invisible for the full TTL — 10
 * minutes for vehicles, an hour for categories.
 */
export async function cacheInvalidatePrefix(prefix: string): Promise<void> {
  const redis = await getRedis();

  if (redis) {
    try {
      const keys = await redis.keys(`${prefix}*`);
      if (Array.isArray(keys) && keys.length) await redis.del(...keys);
    } catch {}
  }

  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}
