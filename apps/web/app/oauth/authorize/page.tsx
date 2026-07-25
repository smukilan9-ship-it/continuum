import { scopes as supportedScopes } from "@continuum/domain";
import { ArrowLeft, ExternalLink, Shield } from "lucide-react";
import { redirect } from "next/navigation";
import { OAuthConsentForm } from "@/components/oauth-consent-form";
import { getServerUser } from "@/lib/auth";
import { issueOAuthConsent, parseAuthorizationRequest } from "@/lib/oauth";

const errorMessages: Record<string, { title: string; body: string }> = {
  invalid_request: {
    title: "This authorization request is not valid",
    body: "The callback, state, or PKCE information did not match. Return to Claude and start the connection again.",
  },
  invalid_state: {
    title: "This approval request expired",
    body: "Nothing was connected. Reload this page or restart the connection from Claude.",
  },
  authorization_failed: {
    title: "The connection could not be saved",
    body: "Your existing Continuum data is safe. Try the approval again.",
  },
  rate_limited: {
    title: "Too many connection attempts",
    body: "Wait a few minutes, then try again.",
  },
  invalid_decision: {
    title: "Choose whether to allow this connection",
    body: "Review the permissions below and try again.",
  },
};

const permissionCopy: Record<string, { title: string; description: string }> = {
  "memory:read": { title: "Use relevant academic memory", description: "Read compact context that helps Claude continue your work." },
  "memory:write": { title: "Save useful academic context", description: "Record approved notes and outcomes in your Continuum memory." },
  "goals:read": { title: "See your learning goals", description: "Read active goals, priorities, and deadlines." },
  "goals:write": { title: "Update your learning goals", description: "Create or update goals when you explicitly ask." },
  "learning:read": { title: "See learning progress", description: "Read current topics, weak areas, and verified progress." },
  "learning:write": { title: "Record learning progress", description: "Save activities and evidence you choose to submit." },
  "research:read": { title: "Use research projects and sources", description: "Read relevant projects, papers, notes, and source context." },
  "research:write": { title: "Update research work", description: "Add or update research items when you explicitly ask." },
  "schedule:read": { title: "See your saved study schedule", description: "Read upcoming study blocks and fixed commitments." },
  "schedule:propose": { title: "Draft schedule changes", description: "Create schedule suggestions for you to review." },
  "schedule:commit": { title: "Save approved schedule changes", description: "Save schedule changes only after confirmation." },
  "resources:read": { title: "Find learning resources", description: "Use Continuum’s reviewed resource library." },
  "routing:invoke": { title: "Ask Continuum for specialist help", description: "Use bounded Continuum AI assistance for eligible tasks." },
};

export const metadata = {
  title: "Connect Claude · Continuum",
  robots: { index: false, follow: false },
};

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getServerUser();
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === "string" && name !== "oauth_error") query.set(name, value);
  }
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/oauth/authorize?${query}`)}`);

  let authorization;
  try {
    authorization = await parseAuthorizationRequest(query, supportedScopes);
  } catch {
    return (
      <main className="oauth-page">
        <OAuthHeader />
        <section className="oauth-error-card" role="alert">
          <p className="eyebrow">CONNECTION NOT STARTED</p>
          <h1>This authorization request is not valid</h1>
          <p>The callback, state, or security information is missing or does not match. Return to Claude and start the connection again.</p>
          <a className="button button-primary" href="/integrations#claude">Return to Connections</a>
        </section>
      </main>
    );
  }

  const consentToken = await issueOAuthConsent(user.id, authorization);
  const error = typeof raw.oauth_error === "string" ? errorMessages[raw.oauth_error] ?? errorMessages.authorization_failed : undefined;
  const fields = {
    client_id: authorization.clientId,
    redirect_uri: authorization.redirectUri,
    response_type: "code",
    scope: authorization.requestedScopes.join(" "),
    state: authorization.state,
    code_challenge: authorization.codeChallenge,
    code_challenge_method: "S256",
    resource: authorization.resource,
  };
  const permissions = authorization.requestedScopes.map((scope) => ({
    scope,
    title: permissionCopy[scope]?.title ?? scope.replaceAll(":", " "),
    description: permissionCopy[scope]?.description ?? "Use this Continuum capability for the requested connection.",
    write: /:(write|commit|propose|invoke)$/.test(scope),
  }));

  return (
    <main className="oauth-page">
      <OAuthHeader />
      <section className="oauth-card" aria-labelledby="oauth-title">
        <div className="oauth-card-heading">
          <span className="oauth-client-mark"><Shield size={22} aria-hidden="true" /></span>
          <div>
            <p className="eyebrow">CLAUDE MCP CONNECTION</p>
            <h1 id="oauth-title">Allow {authorization.client.clientName} to connect?</h1>
            <p>
              Signed in as <strong>{user.email}</strong>. After approval, you will return to{" "}
              <strong>{new URL(authorization.redirectUri).hostname}</strong>.
            </p>
          </div>
        </div>

        {error ? (
          <div className="oauth-inline-error" role="alert">
            <strong>{error.title}</strong>
            <p>{error.body}</p>
          </div>
        ) : null}

        <div className="oauth-request-copy">
          <h2>Requested permissions</h2>
          <p>Uncheck anything you do not want to share. Permission names are explained in plain English.</p>
        </div>
        <OAuthConsentForm consentToken={consentToken} permissions={permissions} fields={fields} />
        <a className="oauth-cancel-link" href="/integrations?connection=cancelled#claude">
          <ArrowLeft size={14} aria-hidden="true" /> Cancel and return to Connections
        </a>
      </section>
      <footer className="oauth-footer">
        <span>PKCE protected · short-lived access · revocable</span>
        <a href="/privacy" target="_blank">Privacy <ExternalLink size={12} aria-hidden="true" /></a>
      </footer>
    </main>
  );
}

function OAuthHeader() {
  return (
    <header className="oauth-header">
      <a className="brand" href="/integrations" aria-label="Continuum Connections">
        <span className="brand-symbol">C</span>
        <span>Continuum</span>
      </a>
      <nav aria-label="Connection context">
        <span>Connections</span>
        <span aria-hidden="true">/</span>
        <strong>Authorize Claude</strong>
      </nav>
    </header>
  );
}
