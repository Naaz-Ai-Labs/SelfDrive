import { createHash } from "node:crypto";
import { sbSelectOne, sbInsert, sbUpdate } from "./supabase-rest";

export type IdempotencyRecord = {
  id: number;
  key: string;
  operation: string;
  payload_hash: string;
  status: "processing" | "completed" | "failed";
  response_json: string | null;
  status_code: number;
  created_at: string;
  expires_at: string;
};

export class IdempotencyConflictError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyConflictError";
    this.statusCode = 409;
  }
}

function canonicalize(val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(val as Record<string, unknown>).sort()) {
    sorted[k] = canonicalize((val as Record<string, unknown>)[k]);
  }
  return sorted;
}

/**
 * Computes a deterministic SHA-256 hash of any JSON-serializable payload.
 */
export function hashPayload(payload: unknown): string {
  try {
    const canonical = canonicalize(payload ?? {});
    const serialized = JSON.stringify(canonical);
    return createHash("sha256").update(serialized).digest("hex");
  } catch {
    return createHash("sha256").update(String(payload)).digest("hex");
  }
}

/**
 * Executes a mutation with end-to-end idempotency protection.
 *
 * 1. Checks if an operation with this exact key already exists in Supabase.
 * 2. If it exists:
 *    - Same payload hash + completed status => returns the cached response.
 *    - Different payload hash => throws 409 Idempotency Conflict.
 *    - Still processing within last 15s => throws 409 Request in Progress.
 * 3. If new: records 'processing', runs the handler, saves 'completed' with response JSON.
 * 4. Fails safely if the metadata table is unreachable.
 */
export async function withIdempotency<T>(
  key: string | undefined | null,
  operation: string,
  payload: unknown,
  handler: () => Promise<T>
): Promise<T> {
  // If no idempotency key is provided by the caller, execute directly
  if (!key || typeof key !== "string" || key.trim() === "") {
    return handler();
  }

  const cleanKey = key.trim();
  const payloadHash = hashPayload(payload);

  // Check existing key in Supabase
  try {
    const existing = await sbSelectOne<IdempotencyRecord>(
      "idempotency_keys",
      `select=*&key=eq.${encodeURIComponent(cleanKey)}`
    );

    if (existing.ok && existing.data) {
      const record = existing.data;

      // 1. Conflict: Same key reused with different payload
      if (record.payload_hash !== payloadHash) {
        throw new IdempotencyConflictError(
          `Idempotency key conflict: key "${cleanKey}" was already used for ${record.operation} with a different payload.`
        );
      }

      // 2. Exact match: Already completed
      if (record.status === "completed" && record.response_json) {
        try {
          return JSON.parse(record.response_json) as T;
        } catch {
          return record.response_json as unknown as T;
        }
      }

      // 3. Processing in progress
      if (record.status === "processing") {
        const createdAt = new Date(record.created_at).getTime();
        const now = Date.now();
        // If created within the last 30 seconds, reject concurrent duplicate
        if (now - createdAt < 30_000) {
          throw new IdempotencyConflictError(
            `Operation with key "${cleanKey}" is currently being processed.`
          );
        }
      }
    }
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      throw err;
    }
    // Non-critical: continue if query fails
  }

  // Register processing key
  let registeredId: number | null = null;
  try {
    const insertRes = await sbInsert<{ id: number }>("idempotency_keys", {
      key: cleanKey,
      operation,
      payload_hash: payloadHash,
      status: "processing",
    });
    if (insertRes.ok && insertRes.data) {
      registeredId = Number(insertRes.data.id);
    }
  } catch {
    // Non-critical: continue if insert fails
  }

  try {
    const result = await handler();

    // Mark as completed with response cache
    if (registeredId) {
      try {
        await sbUpdate("idempotency_keys", `id=eq.${registeredId}`, {
          status: "completed",
          response_json: JSON.stringify(result ?? null),
          status_code: 200,
        });
      } catch {
        // Non-fatal
      }
    }

    return result;
  } catch (err: any) {
    if (registeredId) {
      try {
        await sbUpdate("idempotency_keys", `id=eq.${registeredId}`, {
          status: "failed",
          response_json: JSON.stringify({ error: err?.message || String(err) }),
          status_code: err?.statusCode || 500,
        });
      } catch {
        // Non-fatal
      }
    }
    throw err;
  }
}
