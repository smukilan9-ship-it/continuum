import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type SecurityEmailKind =
  | "verify_email"
  | "reset_password"
  | "convert_account"
  | "password_changed"
  | "account_deleted";

type EmailMessage = {
  to: string;
  kind: SecurityEmailKind;
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function securityEmail(input: {
  to: string;
  displayName?: string;
  kind: SecurityEmailKind;
  actionUrl?: string;
}): EmailMessage {
  const name = input.displayName?.trim() || "there";
  const copy = {
    verify_email: {
      subject: "Verify your Continuum email",
      heading: "Verify your email",
      body: "Confirm this address to unlock Continuum’s connected and AI-powered features.",
      action: "Verify email",
    },
    reset_password: {
      subject: "Reset your Continuum password",
      heading: "Reset your password",
      body: "A password reset was requested for your Continuum account. The link expires in 30 minutes and works once.",
      action: "Reset password",
    },
    convert_account: {
      subject: "Create a password for your Continuum account",
      heading: "Convert your Continuum account",
      body: "Continuum no longer uses Google sign-in. Verify ownership of this email and create a native password. Existing sessions are revoked after conversion.",
      action: "Create password",
    },
    password_changed: {
      subject: "Your Continuum password was changed",
      heading: "Password changed",
      body: "Your Continuum password was changed and previous sessions were revoked. If this was not you, contact your deployment administrator immediately.",
      action: "",
    },
    account_deleted: {
      subject: "Your Continuum account was deleted",
      heading: "Account deleted",
      body: "Your Continuum account and private server-side data were deleted. Any Obsidian notes you chose to preserve remain in your vault.",
      action: "",
    },
  }[input.kind];
  const action = input.actionUrl && copy.action
    ? `\n\n${copy.action}: ${input.actionUrl}`
    : "";
  const actionHtml = input.actionUrl && copy.action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#075985;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(copy.action)}</a></p><p style="font-size:12px;color:#64748b;overflow-wrap:anywhere">${escapeHtml(input.actionUrl)}</p>`
    : "";
  return {
    to: input.to,
    kind: input.kind,
    subject: copy.subject,
    text: `Hello ${name},\n\n${copy.body}${action}\n\nContinuum Security`,
    html: `<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body style="margin:0;background:#f4f8fb;font-family:Arial,sans-serif;color:#0f2942"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dbe7ef;border-radius:12px"><p style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#0369a1">CONTINUUM SECURITY</p><h1 style="font-size:24px">${escapeHtml(copy.heading)}</h1><p>Hello ${escapeHtml(name)},</p><p style="line-height:1.6">${escapeHtml(copy.body)}</p>${actionHtml}<p style="margin-top:32px;font-size:12px;color:#64748b">Continuum will never ask you to reply with your password or an API key.</p></main></body></html>`,
  };
}

export async function sendSecurityEmail(message: EmailMessage) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.TRANSACTIONAL_EMAIL_FROM?.trim();
  if (apiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: { "X-Entity-Ref-ID": randomUUID() },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Transactional email provider returned ${response.status}`);
    const payload = await response.json().catch(() => ({})) as { id?: string };
    return { delivered: true, provider: "resend", messageId: payload.id };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Transactional email is not configured");
  }
  const configured = process.env.MAIL_CAPTURE_DIR?.trim();
  if (!configured) return { delivered: false, provider: "development_noop" };
  const directory = resolve(configured);
  await mkdir(directory, { recursive: true });
  const id = `continuum-mail-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await writeFile(join(directory, `${id}.json`), JSON.stringify(message, null, 2), { mode: 0o600 });
  return { delivered: true, provider: "development_capture", messageId: id };
}
