import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit reads its built-in .afm font metrics from disk at runtime; bundling it
  // breaks that lookup on a serverless lambda while still working locally.
  // better-sqlite3 / node:sqlite were removed with the SQLite layer and are gone.
  serverExternalPackages: ["bcryptjs", "pdfkit"],
  outputFileTracingRoot: path.join(__dirname, ".."),

  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
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
