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

// In-Memory Fallback Cache Store (for environments without Upstash Redis credentials or package)
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
 * Fixed-window rate limit: allows at most `limit` calls per `windowSeconds` for a
 * given key. Returns true if this call is allowed, false if the caller should be
 * throttled. Same INCR-then-EXPIRE pattern whether backed by real Upstash Redis
 * (shared across serverless instances — the only backing that's correct for this,
 * per the file-level note above) or the in-memory fallback (per-instance only, so
 * strictly a lower bound, but still better than nothing).
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const redis = await getRedis();
  const rlKey = `ratelimit:${key}`;

  if (redis) {
    try {
      const count = await redis.incr(rlKey);
      if (count === 1) await redis.expire(rlKey, windowSeconds);
      return count <= limit;
    } catch (err: any) {
      console.warn("⚠️ Upstash Redis checkRateLimit error:", err?.message || err);
      // A Redis hiccup must not itself block real customers from booking.
      return true;
    }
  }

  const now = Date.now();
  const item = memoryCache.get(rlKey);
  if (!item || now >= item.expiresAt) {
    memoryCache.set(rlKey, { value: 1, expiresAt: now + windowSeconds * 1000 });
    return true;
  }
  item.value += 1;
  return item.value <= limit;
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
