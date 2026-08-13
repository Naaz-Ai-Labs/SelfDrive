-- Shared rate limiting.
--
-- Login attempts and OTP resend cooldowns were held in a module-level JavaScript
-- Map. On serverless that map is per-instance and resets on every cold start, so
-- the "5 attempts then block" budget was really 5 attempts *per lambda* — N warm
-- instances gave an attacker 5N tries, and a cold start reset the counter to zero.
--
-- Backed by Postgres rather than Redis deliberately: the database is already a hard
-- dependency of every one of these routes, so this adds no new infrastructure and
-- cannot silently degrade to per-instance memory the way the Redis helper does when
-- its credentials are absent.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits (window_start);

COMMENT ON TABLE public.rate_limits IS
  'Shared counters for login/OTP throttling. Keys are caller-defined and opaque (e.g. "login:<ip>", "otp:<target-hash>"). Never store a raw OTP or credential here.';

/**
 * Atomically records one attempt against `p_key` and reports whether the caller is
 * allowed to proceed.
 *
 * Returns TRUE when the request may continue, FALSE when it is rate limited.
 * The whole check-and-increment happens in a single statement, so two concurrent
 * requests cannot both observe "4 attempts used" and both proceed.
 */
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key TEXT,
  p_max_attempts INTEGER,
  p_window_seconds INTEGER,
  p_block_seconds INTEGER DEFAULT 0
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_count INTEGER;
  v_blocked_until TIMESTAMPTZ;
BEGIN
  INSERT INTO public.rate_limits (key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET
      -- Reset the counter when the previous window has elapsed.
      count = CASE
                WHEN public.rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
                THEN 1
                ELSE public.rate_limits.count + 1
              END,
      window_start = CASE
                       WHEN public.rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
                       THEN v_now
                       ELSE public.rate_limits.window_start
                     END
  RETURNING count, blocked_until INTO v_count, v_blocked_until;

  -- Still inside an active block from a previous breach.
  IF v_blocked_until IS NOT NULL AND v_blocked_until > v_now THEN
    RETURN FALSE;
  END IF;

  IF v_count > p_max_attempts THEN
    IF p_block_seconds > 0 THEN
      UPDATE public.rate_limits
         SET blocked_until = v_now + make_interval(secs => p_block_seconds)
       WHERE key = p_key;
    END IF;
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END $$;

/** Clears a key after a legitimate success (e.g. correct password). */
CREATE OR REPLACE FUNCTION public.reset_rate_limit(p_key TEXT)
RETURNS VOID
LANGUAGE sql
AS $$
  DELETE FROM public.rate_limits WHERE key = p_key;
$$;

/** Housekeeping: drop counters whose window and block have both lapsed. */
CREATE OR REPLACE FUNCTION public.prune_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.rate_limits
   WHERE window_start < NOW() - INTERVAL '1 day'
     AND (blocked_until IS NULL OR blocked_until < NOW());
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
