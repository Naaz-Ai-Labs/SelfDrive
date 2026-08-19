/**
 * Direct PostgREST access for the CRM.
 *
 * This is the replacement for `db.ts` (the local SQLite mirror). Supabase is the
 * single source of truth; there is no second copy of the data to fall out of sync.
 *
 * Deliberate design choices, each one a bug we hit with the old layer:
 *
 * - No hardcoded URL or key fallbacks. A missing credential throws instead of
 *   silently degrading to an anon client that under-reads under RLS.
 * - No anon-key fallback for privileged operations. Falling back from the service
 *   key to the publishable key turned "misconfigured" into "silently reads nothing".
 * - Every response is content-type checked before parsing. A Supabase gateway or WAF
 *   HTML page used to blow up as "Unexpected token '<' is not valid JSON".
 * - Errors are returned, never swallowed. The old layer's `.catch(() => {})` is what
 *   made writes disappear without a trace.
 * - `num()` is exported because PostgREST returns NUMERIC columns as STRINGS. Money
 *   arithmetic without it concatenates instead of adding.
 */

export type RestResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

function credentials(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  // Service-role tier only. Never fall back to the publishable key here.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url) throw new Error("SUPABASE_URL is not configured.");
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not configured.");

  return { url, key };
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const { key } = credentials();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Coerces a PostgREST value to a number. NUMERIC arrives as a string. */
export function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function parse<T>(res: Response, label: string): Promise<RestResult<T>> {
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    console.error(`[supabase] ${label}: non-JSON response (${res.status}): ${body}`);
    return { ok: false, error: `Database returned a non-JSON response (${res.status}).`, status: res.status };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    console.error(`[supabase] ${label}: malformed JSON`, err);
    return { ok: false, error: "Database returned malformed JSON.", status: res.status };
  }

  if (!res.ok) {
    const message = (json as { message?: string })?.message ?? `${label} failed (${res.status})`;
    console.error(`[supabase] ${label}: ${message}`, json);
    return { ok: false, error: message, status: res.status };
  }

  return { ok: true, data: json as T };
}

async function request<T>(path: string, init: RequestInit, label: string): Promise<RestResult<T>> {
  let url: string;
  try {
    url = `${credentials().url}/rest/v1/${path}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Supabase is not configured.";
    console.error(`[supabase] ${label}: ${message}`);
    return { ok: false, error: message };
  }

  const maxAttempts = 3;
  let lastError = "Could not reach the database";
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: headers(init.headers as Record<string, string>),
        cache: "no-store",
      });

      const parsed = await parse<T>(res, label);
      if (parsed.ok) {
        return parsed;
      }

      lastError = parsed.error;
      lastStatus = parsed.status;

      const isTransient =
        lastError.toLowerCase().includes("jwt issued at future") ||
        lastError.toLowerCase().includes("jwt") ||
        lastStatus === 401 ||
        lastStatus === 429 ||
        (lastStatus !== undefined && lastStatus >= 500);

      if (isTransient && attempt < maxAttempts) {
        console.warn(
          `[supabase] ${label}: transient error on attempt ${attempt}/${maxAttempts} (${lastError}). Retrying in ${attempt * 150}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 150));
        continue;
      }

      return parsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = `Could not reach the database: ${message}`;
      console.error(
        `[supabase] ${label}: network failure on attempt ${attempt}/${maxAttempts} — ${message}`
      );
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 150));
        continue;
      }
      return { ok: false, error: lastError };
    }
  }

  return { ok: false, error: lastError, status: lastStatus };
}

/**
 * Runs a PostgREST select.
 * @param query raw querystring, e.g. `select=*&active=eq.true&order=name.asc`
 */
export async function sbSelect<T = Record<string, unknown>>(table: string, query = "select=*"): Promise<RestResult<T[]>> {
  return request<T[]>(`${table}?${query}`, { method: "GET" }, `select ${table}`);
}

/** Selects a single row, or null when nothing matches. */
export async function sbSelectOne<T = Record<string, unknown>>(table: string, query: string): Promise<RestResult<T | null>> {
  const res = await sbSelect<T>(table, `${query}&limit=1`);
  if (!res.ok) return res;
  return { ok: true, data: res.data[0] ?? null };
}

export async function sbInsert<T = Record<string, unknown>>(
  table: string,
  record: Record<string, unknown> | Record<string, unknown>[]
): Promise<RestResult<T>> {
  const res = await request<T[]>(
    table,
    { method: "POST", body: JSON.stringify(record), headers: { Prefer: "return=representation" } },
    `insert ${table}`
  );
  if (!res.ok) return res;
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { ok: true, data: row as T };
}

export async function sbUpdate<T = Record<string, unknown>>(
  table: string,
  filter: string,
  patch: Record<string, unknown>
): Promise<RestResult<T[]>> {
  return request<T[]>(
    `${table}?${filter}`,
    { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=representation" } },
    `update ${table}`
  );
}

export async function sbUpsert<T = Record<string, unknown>>(
  table: string,
  record: Record<string, unknown> | Record<string, unknown>[],
  onConflict?: string
): Promise<RestResult<T>> {
  const path = onConflict ? `${table}?on_conflict=${onConflict}` : table;
  const res = await request<T[]>(
    path,
    {
      method: "POST",
      body: JSON.stringify(record),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    },
    `upsert ${table}`
  );
  if (!res.ok) return res;
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  return { ok: true, data: row as T };
}

export async function sbDelete(table: string, filter: string): Promise<RestResult<null>> {
  const res = await request<unknown>(`${table}?${filter}`, { method: "DELETE" }, `delete ${table}`);
  if (!res.ok) return res;
  return { ok: true, data: null };
}

/**
 * Calls a Postgres function. Use this for anything that must be atomic —
 * counters especially. `paid_amount = paid_amount + x` done as a read-then-write in
 * application code loses concurrent updates.
 */
export async function sbRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<RestResult<T>> {
  return request<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }, `rpc ${fn}`);
}

/** Exact row count matching a filter, via PostgREST's count header. */
export async function sbCount(table: string, filter = ""): Promise<RestResult<number>> {
  let url: string;
  try {
    url = `${credentials().url}/rest/v1/${table}?select=id${filter ? `&${filter}` : ""}`;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Supabase is not configured." };
  }

  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: headers({ Prefer: "count=exact", Range: "0-0" }),
      cache: "no-store",
    });
    // Content-Range looks like "0-0/42"; the total follows the slash.
    const total = res.headers.get("content-range")?.split("/")[1];
    if (!res.ok || !total) return { ok: false, error: `count ${table} failed (${res.status})`, status: res.status };
    return { ok: true, data: Number(total) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
