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

export default nextConfig;
