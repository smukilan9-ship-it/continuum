import type { MetadataRoute } from "next";

/**
 * Only the four public routes are crawlable (redesign.md §9.12). The disallow
 * list is the current app surface, not the pre-redesign one — `/g/`, `/plan`,
 * `/study/`, `/library`, `/settings`, `/connections` and the account-recovery
 * routes all shipped after the previous version of this file was written and
 * were being offered to crawlers.
 */
const APP_ROUTES = [
  "/api/",
  "/account",
  "/activity",
  "/assistant",
  "/code",
  "/connections",
  "/dev",
  "/forgot-password",
  "/g/",
  "/goals",
  "/integrations",
  "/learn",
  "/library",
  "/mcp",
  "/memory",
  "/oauth",
  "/openalex",
  "/plan",
  "/research",
  "/reset-password",
  "/settings",
  "/study/",
  "/today",
  "/verify-email",
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
