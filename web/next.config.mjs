/** Pin the image optimizer to hosts we actually serve from — `hostname: "**"` turns
 * /_next/image into an open proxy for the whole internet. */
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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
