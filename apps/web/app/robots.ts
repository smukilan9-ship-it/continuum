import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_BASE_URL ?? "https://continuumstudy.vercel.app";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms"],
      disallow: ["/api/", "/today", "/assistant", "/goals", "/learn", "/code", "/research", "/memory", "/account", "/activity", "/integrations", "/zotero", "/openalex"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
