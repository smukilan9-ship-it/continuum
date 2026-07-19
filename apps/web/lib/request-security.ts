function normalizedOrigin(value: string | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function isLoopback(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Protect cookie-authenticated mutations from cross-site requests.
 * Production accepts only the configured public application origin. Local
 * development also accepts loopback-to-loopback requests because Next can
 * canonicalize request URLs to a different loopback host or port.
 */
export function sameOriginWrite(
  request: Request,
  env: { NODE_ENV?: string; APP_BASE_URL?: string } = process.env,
) {
  const suppliedOrigin = normalizedOrigin(request.headers.get("origin") ?? undefined);
  if (!suppliedOrigin) return env.NODE_ENV !== "production";

  const requestOrigin = normalizedOrigin(request.url);
  const configuredOrigin = normalizedOrigin(env.APP_BASE_URL);

  if (env.NODE_ENV === "production") {
    return Boolean(configuredOrigin && suppliedOrigin === configuredOrigin);
  }

  if (suppliedOrigin === requestOrigin || suppliedOrigin === configuredOrigin) return true;
  return Boolean(requestOrigin && isLoopback(suppliedOrigin) && isLoopback(requestOrigin));
}
