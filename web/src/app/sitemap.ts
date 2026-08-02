import type { MetadataRoute } from "next";
import { getVehicles, getBlogPosts } from "@/lib/data";

export const revalidate = 3600;
const domain = "https://darshhrentals.in";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base = [
    { url: domain, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${domain}/vehicles`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${domain}/gallery`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${domain}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${domain}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${domain}/booking`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${domain}/insights`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ] as MetadataRoute.Sitemap;

  const [vehiclesList, posts] = await Promise.all([getVehicles(), getBlogPosts()]);
  const vehicles = vehiclesList.map((v) => ({
    url: `${domain}/vehicles/${v.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8,
  }));
  const blogUrls = posts.map((p) => ({
    url: `${domain}/insights/${String(p.slug)}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6,
  }));
  return [...base, ...vehicles, ...blogUrls];
}
