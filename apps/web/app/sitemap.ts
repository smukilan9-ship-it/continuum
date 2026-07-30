import type { MetadataRoute } from "next";

/**
 * The four public routes (redesign.md §9.12). Everything else is behind a
 * session, so listing it would only advertise redirects to /login.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.APP_BASE_URL ?? "https://continuumstudy.vercel.app";
  const lastModified = new Date();
  return [
    { url: baseUrl, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/login`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/privacy`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/terms`, lastModified, changeFrequency: "monthly", priority: 0.3 },
  ];
}
