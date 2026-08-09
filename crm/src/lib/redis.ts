import { Redis } from "@upstash/redis";

// In-Memory Fallback Cache Store (for environments without Upstash Redis credentials)
const memoryCache = new Map<string, { value: any; expiresAt: number }>();

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      redisClient = new Redis({ url, token });
      return redisClient;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Retrieves a cached value from Upstash Redis (or in-memory fallback cache).
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();

  if (redis) {
    try {
      const data = await redis.get<T>(key);
      if (data !== null) return data;
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
  const redis = getRedis();

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
  const redis = getRedis();

  if (redis) {
    try {
      await redis.del(key);
    } catch {}
  }

  memoryCache.delete(key);
}
