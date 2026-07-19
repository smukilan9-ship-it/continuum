const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const userInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google sign-in is not configured");
  return { clientId, clientSecret };
}

export function googleSignInConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.DATABASE_URL && process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY);
}

export function googleSignInRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function googleSignInUrl(input: { origin: string; state: string; codeChallenge: string }) {
  const { clientId } = config();
  const parameters = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleSignInRedirectUri(input.origin),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${authorizationEndpoint}?${parameters}`;
}

export async function exchangeGoogleSignInCode(input: { code: string; origin: string; codeVerifier: string }) {
  const { clientId, clientSecret } = config();
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: input.code, code_verifier: input.codeVerifier, client_id: clientId, client_secret: clientSecret, redirect_uri: googleSignInRedirectUri(input.origin), grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description ?? "Google sign-in could not be completed");
  return payload.access_token;
}

export async function googleVerifiedIdentity(accessToken: string) {
  const response = await fetch(userInfoEndpoint, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!response.ok || !payload.sub || !payload.email || payload.email_verified !== true) throw new Error("Google did not return a verified account identity");
  return { subject: payload.sub, email: payload.email.toLowerCase(), displayName: payload.name?.trim() || payload.email.split("@")[0]! };
}
