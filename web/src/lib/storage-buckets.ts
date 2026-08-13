/**
 * Storage boundaries — mirror of crm/src/lib/storage-buckets.ts.
 * Keep the two in sync; they describe the same buckets in the same project.
 *
 * Public and private objects must not share a bucket. Vehicle photos are meant to be
 * world-readable; customer identity documents are government IDs and must never be.
 * They previously shared the public `vehicle-photos` bucket, so every uploaded
 * Aadhaar/licence was readable by URL without authenticating.
 */

/** World-readable: vehicle photos, gallery images, marketing media. */
export const PUBLIC_MEDIA_BUCKET = "vehicle-photos";

/** Private: customer identity documents. Served only via an authenticated route. */
export const PRIVATE_DOCS_BUCKET = "customer-documents";

/**
 * Rejects anything that could escape its intended prefix. The upload route builds a
 * storage key from a caller-supplied `folder` value and previously only trimmed
 * slashes, so `../` segments passed straight through.
 */
export function isSafeStoragePath(path: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.includes("..")) return false;
  if (path.startsWith("/") || path.includes("\\")) return false;
  if (path.includes("\0")) return false;
  return /^[A-Za-z0-9._\-/]+$/.test(path);
}

/** Strips a caller-supplied folder down to something safe, or null if unusable. */
export function sanitizeFolder(folder: string | undefined | null): string | null {
  if (!folder) return null;
  const trimmed = folder.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return null;
  if (!isSafeStoragePath(trimmed)) return null;
  return trimmed;
}
