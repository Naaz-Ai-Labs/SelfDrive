/**
 * High-reliability direct Supabase PostgREST client for web serverless endpoints.
 * Completely bypasses @supabase/supabase-js JWT clock validation checks ('JWT issued at future')
 * by using direct HTTP fetch with service_role secret key headers.
 */

/** Throws when the project URL is unset — never falls back to a literal project host.
 * Callers invoke this inside their try block so it surfaces as a typed failure. */
export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not configured on the server.");
  return url.replace(/\/$/, "");
}

function getSupabaseCredentials() {
  const url = getSupabaseUrl();
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
  return { url, key };
}

/** PostgREST behind a proxy can answer with an HTML error page; parsing that as JSON
 * throws "Unexpected token '<'". Check the content type before touching res.json(). */
async function readJson(
  res: Response,
  label: string
): Promise<{ ok: true; json: any } | { ok: false; error: string }> {
  if (!res.headers.get("content-type")?.includes("application/json")) {
    const body = await res.text().catch(() => "");
    console.warn(`Supabase REST non-JSON response [${label}] (${res.status}):`, body.slice(0, 200));
    return { ok: false, error: `Database returned a non-JSON response (${res.status})` };
  }
  return { ok: true, json: await res.json() };
}

export async function supabaseRestInsert<T = Record<string, unknown>>(
  table: string,
  record: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const { url, key } = getSupabaseCredentials();
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(record),
      cache: "no-store",
    });
    const parsed = await readJson(res, `insert ${table}`);
    if (!parsed.ok) return parsed;
    const json = parsed.json;
    if (!res.ok) {
      console.warn(`Supabase REST insert error [${table}]:`, json);
      return { ok: false, error: json?.message || `Insert into ${table} failed` };
    }
    const data = Array.isArray(json) ? json[0] : json;
    return { ok: true, data: data as T };
  } catch (err: any) {
    console.error(`Supabase REST insert network exception [${table}]:`, err?.message || err);
    return { ok: false, error: err?.message || "Network error communicating with database" };
  }
}

export async function supabaseRestUpsert<T = Record<string, unknown>>(
  table: string,
  record: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const { url, key } = getSupabaseCredentials();
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(record),
      cache: "no-store",
    });
    const parsed = await readJson(res, `upsert ${table}`);
    if (!parsed.ok) return parsed;
    const json = parsed.json;
    if (!res.ok) {
      console.warn(`Supabase REST upsert error [${table}]:`, json);
      return { ok: false, error: json?.message || `Upsert into ${table} failed` };
    }
    const data = Array.isArray(json) ? json[0] : json;
    return { ok: true, data: data as T };
  } catch (err: any) {
    console.error(`Supabase REST upsert network exception [${table}]:`, err?.message || err);
    return { ok: false, error: err?.message || "Network error communicating with database" };
  }
}

export async function supabaseRestSelect<T = Record<string, unknown>>(
  table: string,
  query: string
): Promise<T[] | null> {
  try {
    const { url, key } = getSupabaseCredentials();
    const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = await readJson(res, `select ${table}`);
    if (!parsed.ok) return null;
    return parsed.json as T[];
  } catch (err: any) {
    console.warn(`Supabase REST select error [${table}]:`, err?.message || err);
    return null;
  }
}
