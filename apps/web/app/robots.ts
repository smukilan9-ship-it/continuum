import type { MetadataRoute } from "next";

/**
 * Only the four public routes are crawlable (redesign.md §9.12). The disallow
 * list covers both the §7.1 addresses and the legacy paths that now 308 to
 * them, so a crawler holding an old URL is told not to follow it rather than
 * discovering the whole app through a redirect chain.
 */
const APP_ROUTES = [
  "/api/",
  "/ask",
  "/build",
  "/context",
  "/dev",
  "/forgot-password",
  "/g/",
  "/home",
  "/learn",
  "/library",
  "/mcp",
  "/oauth",
  "/plan",
  "/research",
  "/reset-password",
  "/review",
  "/settings",
  "/start",
  "/study/",
  "/verify-email",
  // The §16.7 legacy paths. They 308 to the entries above, but a crawler that
  // has one indexed should be told not to follow it rather than discovering the
  // app through a redirect chain.
  "/account",
  "/activity",
  "/assistant",
  "/code",
  "/connections",
  "/goals",
  "/integrations",
  "/memory",
  "/openalex",
  "/today",
  "/welcome",
  "/zotero",
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_BASE_URL ?? "https://continuumstudy.vercel.app";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/privacy", "/terms"],
      disallow: APP_ROUTES,
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
