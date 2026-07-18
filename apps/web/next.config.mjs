import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  typedRoutes: true,
  transpilePackages: [
    "@continuum/ai",
    "@continuum/domain",
    "@continuum/mcp",
    "@continuum/retrieval",
    "@continuum/schemas",
  ],
};

export default nextConfig;
