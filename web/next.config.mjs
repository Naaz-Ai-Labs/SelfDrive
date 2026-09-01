import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Pin the image optimizer to hosts we actually serve from — `hostname: "**"` turns
 * /_next/image into an open proxy for the whole internet.
 *
 * LEGACY_SUPABASE_HOST: the project this app migrated FROM (puymlkdcoqpptajslucu).
 * Migrating the database copied every storage object across, but the full image URLs
 * already stored in vehicle_photos/vehicles rows were not rewritten — they still point
 * at the old project's domain, and the old project is deliberately being kept alive as
 * a fallback rather than deleted. Both hosts must stay allowed until every stored URL
 * is migrated to the new host; drop this once that cleanup is done. */
const LEGACY_SUPABASE_HOST = "puymlkdcoqpptajslucu.supabase.co";

const supabaseHost = (() => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    return url ? new URL(url).hostname : "*.supabase.co";
  } catch {
    return "*.supabase.co";
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),

  images: {
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost },
      ...(supabaseHost !== LEGACY_SUPABASE_HOST ? [{ protocol: "https", hostname: LEGACY_SUPABASE_HOST }] : []),
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

// The existing config above is passed through untouched; withSentryConfig only adds
// the build-time pieces (source map upload when credentials are present, and the
// /monitoring tunnel so ad-blockers cannot silently drop error reports).
//
// org/project/authToken are read from the environment rather than hardcoded: without
// SENTRY_AUTH_TOKEN the upload step is simply skipped, so builds keep working
// unchanged until those are set in Vercel.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});

