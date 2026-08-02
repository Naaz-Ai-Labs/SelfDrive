import { cookies } from "next/headers";

const BASE = process.env.CRM_API_URL ?? "http://localhost:3001";
const KEY = process.env.GATEWAY_API_KEY ?? "";
export const CUSTOMER_COOKIE = "darshh_customer";

type FetchOptions = { auth?: boolean; cache?: RequestCache; revalidate?: number };

/** Every dynamic piece of data on the public site passes through here to reach the CRM's
 * gateway — this file is the entire trust boundary between the two apps. The gateway key
 * proves the request came from this server (never the browser); `auth: true` additionally
 * forwards the customer's own bearer token, read from web's own httpOnly cookie. */
async function gatewayFetch<T>(path: string, init: RequestInit & FetchOptions = {}): Promise<T> {
  const { auth, cache, revalidate, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("x-gateway-key", KEY);
  if (rest.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (auth) {
    const token = cookies().get(CUSTOMER_COOKIE)?.value;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers,
    ...(revalidate ? { next: { revalidate } } : { cache: cache ?? "no-store" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !("error" in data)) {
    return { error: `Request failed (${res.status})` } as T;
  }
  return data as T;
}

export function gatewayGet<T>(path: string, opts: FetchOptions = {}) {
  return gatewayFetch<T>(path, { method: "GET", ...opts });
}

export function gatewayPost<T>(path: string, body: unknown, opts: FetchOptions = {}) {
  return gatewayFetch<T>(path, { method: "POST", body: JSON.stringify(body), ...opts });
}
