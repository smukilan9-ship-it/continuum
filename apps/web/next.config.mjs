import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  serverExternalPackages: ["@napi-rs/canvas", "sharp"],
  typedRoutes: true,
  transpilePackages: [
    "@continuum/ai",
    "@continuum/db",
    "@continuum/domain",
    "@continuum/mcp",
    "@continuum/retrieval",
    "@continuum/schemas",
  ],
  /**
   * §16.7 — the fifteen legacy paths, as permanent (308) redirects.
   *
   * Every one of these was a live address before the §7.1 rename, so bookmarks,
   * shared links, and the OAuth `returnTo` values already in the wild all keep
   * working. 308 rather than 307 because the new address is the canonical one.
   *
   * `/research` and `/learn` are deliberately *not* in this list. §16.7 sends
   * both to `/home` on the basis that they are absorbed into the goal page, but
   * Learn still owns the practice-set builder and the resource panel, which
   * have no other address yet. Redirecting them today would delete reachable
   * capability, so they stay live and are simply not in the fixed nav.
   */
  async redirects() {
    return [
      { source: "/today", destination: "/home", permanent: true },
      { source: "/assistant", destination: "/ask", permanent: true },
      { source: "/assistant/:path*", destination: "/ask/:path*", permanent: true },
      { source: "/goals", destination: "/plan", permanent: true },
      { source: "/code", destination: "/build", permanent: true },
      { source: "/code/:path*", destination: "/build/:path*", permanent: true },
      { source: "/memory", destination: "/context", permanent: true },
      { source: "/activity", destination: "/review", permanent: true },
      { source: "/integrations", destination: "/settings/connections", permanent: true },
      { source: "/connections", destination: "/settings/connections", permanent: true },
      { source: "/account", destination: "/settings/account", permanent: true },
      { source: "/account/:segment", destination: "/settings/:segment", permanent: true },
      // The scholarly routes merged into the Library, keeping their deep links.
      { source: "/openalex", destination: "/library?tab=discover", permanent: true },
      { source: "/openalex/:entity/:id", destination: "/library/:entity/:id", permanent: true },
      { source: "/zotero", destination: "/library?tab=zotero", permanent: true },
      { source: "/welcome", destination: "/start", permanent: true },
    ];
  },

  async headers() {
    const oauthPopupHeaders = [
      // Claude completes hosted connector authorization in a cross-origin popup.
      // A same-origin COOP policy severs that popup from Claude before its
      // callback can finish the code exchange, leaving the UI on "Connecting".
      { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
    ];
    const oauthConsentHeaders = [
      ...oauthPopupHeaders,
      // Chromium applies form-action across redirects. The consent form posts
      // to Continuum and then redirects to the dynamically registered OAuth
      // callback, so this route must permit the secure callback hop.
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}; connect-src 'self' http://localhost:* http://127.0.0.1:*; worker-src 'self' blob:` },
    ];
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}; connect-src 'self' http://localhost:* http://127.0.0.1:*; worker-src 'self' blob:` },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
      ...(process.env.VERCEL_ENV === "preview" ? [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] : []),
    ];
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/login", headers: oauthPopupHeaders },
      { source: "/oauth/authorize", headers: oauthConsentHeaders },
      { source: "/api/oauth/authorize", headers: oauthConsentHeaders },
    ];
  },
};

export default nextConfig;
