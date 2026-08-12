/**
 * High-reliability direct Supabase PostgREST client for web serverless endpoints.
 * Completely bypasses @supabase/supabase-js JWT clock validation checks ('JWT issued at future')
 * by using direct HTTP fetch with service_role secret key headers.
 */

function getSupabaseCredentials() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://puymlkdcoqpptajslucu.supabase.co").replace(/\/$/, "");
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
  return { url, key };
}

export async function supabaseRestInsert<T = Record<string, unknown>>(
  table: string,
  record: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { url, key } = getSupabaseCredentials();
  try {
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
    const json = await res.json();
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
  const { url, key } = getSupabaseCredentials();
  try {
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
    const json = await res.json();
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
  const { url, key } = getSupabaseCredentials();
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T[];
  } catch (err: any) {
    console.warn(`Supabase REST select error [${table}]:`, err?.message || err);
    return null;
  }
}
