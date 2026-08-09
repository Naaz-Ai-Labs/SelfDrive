import { cookies } from "next/headers";

function getBaseUrl(): string {
  if (process.env.CRM_API_URL) return process.env.CRM_API_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_CRM_API_URL) return process.env.NEXT_PUBLIC_CRM_API_URL.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return "https://darshan-tours-crm-papadon.vercel.app";
  }
  return "http://localhost:3001";
}

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
    try {
      const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch {
      // Ignore if called outside a request context
    }
  }
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...rest,
      headers,
      ...(revalidate ? { next: { revalidate } } : { cache: cache ?? "no-store" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !("error" in data)) {
      return { error: `Request failed (${res.status})` } as T;
    }
    return data as T;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch from CRM gateway.";
    return { error: message } as T;
  }
}

import { cacheGet, cacheSet } from "./redis";

export async function gatewayGet<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const isCacheable = !opts.auth && (path.includes("/content") || path.includes("/vehicle"));
  const cacheKey = `web:gateway:${path}`;

  if (isCacheable) {
    const cached = await cacheGet<T>(cacheKey);
    if (cached) return cached;
  }

  const result = await gatewayFetch<T>(path, { method: "GET", ...opts });

  if (isCacheable && result && typeof result === "object" && !("error" in (result as any))) {
    await cacheSet(cacheKey, result, 600);
  }

  return result;
}

export function gatewayPost<T>(path: string, body: unknown, opts: FetchOptions = {}) {
  return gatewayFetch<T>(path, { method: "POST", body: JSON.stringify(body), ...opts });
}
