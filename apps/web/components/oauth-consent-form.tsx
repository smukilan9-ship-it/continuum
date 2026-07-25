"use client";

import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

type Permission = {
  scope: string;
  title: string;
  description: string;
  write: boolean;
};

export function OAuthConsentForm({
  consentToken,
  permissions,
  fields,
}: {
  consentToken: string;
  permissions: Permission[];
  fields: Record<string, string>;
}) {
  const [submitting, setSubmitting] = useState<"approve" | "deny">();
  const submittedRef = useRef(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (submittedRef.current) {
      event.preventDefault();
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    submittedRef.current = true;
    setSubmitting(submitter?.value === "deny" ? "deny" : "approve");
  }

  return (
    <form className="oauth-consent-form" method="post" action="/api/oauth/authorize" onSubmit={submit}>
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <input type="hidden" name="consent_token" value={consentToken} />
      <input type="hidden" name="ux" value="continuum" />

      <fieldset aria-disabled={Boolean(submitting)}>
        <legend className="sr-only">Requested permissions</legend>
        <div className="oauth-permissions">
          {permissions.length ? permissions.map((permission) => (
            <label className="oauth-permission" key={permission.scope}>
              <input name="scope" value={permission.scope} type="checkbox" defaultChecked />
              <span className="oauth-permission-check" aria-hidden="true"><Check size={13} /></span>
              <span>
                <strong>{permission.title}</strong>
                <small>{permission.description}</small>
              </span>
              <em>{permission.write ? "Can make changes" : "Read only"}</em>
            </label>
          )) : (
            <p className="oauth-empty-permissions">This client did not request any supported Continuum permissions.</p>
          )}
        </div>

        <div className="oauth-security-note">
          <ShieldCheck size={18} aria-hidden="true" />
          <p><strong>You stay in control.</strong> You can disconnect this client from Connections at any time.</p>
        </div>

        <div className="oauth-actions">
          <button className="button button-secondary" type="submit" name="decision" value="deny">
            {submitting === "deny" ? <LoaderCircle className="spin" size={15} /> : null}
            {submitting === "deny" ? "Returning…" : "Don’t allow"}
          </button>
          <button className="button button-primary" type="submit" name="decision" value="approve">
            {submitting === "approve" ? <LoaderCircle className="spin" size={15} /> : null}
            {submitting === "approve" ? "Connecting…" : "Approve and connect"}
          </button>
        </div>
      </fieldset>
      <p className="oauth-submit-status" role="status" aria-live="polite">
        {submitting === "approve" ? "Saving the connection and returning to the requesting app…" : submitting === "deny" ? "Declining this request…" : ""}
      </p>
    </form>
  );
}
