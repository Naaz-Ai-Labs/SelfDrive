/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["node:sqlite"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
