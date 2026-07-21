#!/usr/bin/env node
/**
 * Live end-to-end verification of Continuum's complete demo flow on ONE brand-new
 * account, driving only the real application APIs + real MCP OAuth. No Maya, no
 * seed fixture, no mocks. Asserts persisted state at each of the 15 steps.
 *
 * Usage:
 *   pnpm dev                      # in one terminal (needs DATABASE_URL + provider keys)
 *   node scripts/e2e-flow.mjs     # in another (BASE_URL defaults to http://localhost:3000)
 *
 * Exits non-zero if any step fails, so it is safe to run in CI against a
 * deployed preview with real credentials.
 */
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];
let cookie = "";
function step(n, ok, detail) { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${String(n).padStart(2)}. ${detail}`); if (!ok) process.exitCode = 1; }

// --- Minimal valid PDF (extractable by unpdf/pdf.js) so the run needs no assets ---
function buildPdf(lines) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let content = "BT /F1 12 Tf 72 720 Td 14 TL\n";
  for (const line of lines) content += `(${esc(line)}) Tj T*\n`;
  content += "ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
const pdfBytes = buildPdf([
  "Electric Potential - Study Notes",
  "Electric potential is a scalar quantity measured in volts (V).",
  "The electric potential V at a distance r from a point charge Q is given by",
  "V = k Q / r, where k = 8.99 x 10^9 N m^2 / C^2 is Coulomb's constant.",
  "Worked example: for a +2 nC point charge, the potential at 0.75 m is",
  "V = (9 x 10^9)(2 x 10^-9) / 0.75 = 24 volts.",
  "Because potential is a scalar, doubling the test charge at a fixed point does",
  "not change the electric potential V at that point.",
]);

async function api(path, { method = "GET", json, form } = {}) {
  const headers = { origin: BASE, ...(cookie ? { cookie } : {}) };
  let body;
  if (json) { headers["content-type"] = "application/json"; body = JSON.stringify(json); }
  else if (form) { body = form; }
  const res = await fetch(`${BASE}${path}`, { method, headers, body, redirect: "manual" });
  const sc = res.headers.get("set-cookie");
  if (sc && sc.includes("continuum_session=")) cookie = sc.split(";")[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  const email = `flow_${Date.now()}@example.com`;

  const reg = await api("/api/auth/register", { method: "POST", json: { email, password: "vers3cure-pass", displayName: "Flow Demo", timezone: "Asia/Kolkata", educationLevel: "CBSE Class 12" } });
  step(1, reg.status === 201 && !!reg.data.user?.id, `Register fresh account -> ${reg.data.user?.id}`);

  const onb = await api("/api/onboarding", { method: "POST", json: { academicLevel: "CBSE Class 12", subjects: ["Physics"], primarySubject: "Physics", goalTitle: "Ace the Class 12 Physics board exam", goalOutcome: "Score 90%+ and explain electric potential and fields independently", goalType: "exam", deadline: "2026-09-30", weeklyHours: 10, preferredTimes: ["evening"], confidence: "low" } });
  const goalId = onb.data.goal?.id;
  step(2, onb.status === 201 && onb.data.milestones?.length >= 3 && onb.data.tasks?.length >= 4, `Onboard -> ${onb.data.milestones?.length} milestones, ${onb.data.tasks?.length} tasks`);
  step(3, onb.data.schedule?.status === "committed" && !!onb.data.nextAction, `Initial 7-day schedule committed -> ${onb.data.schedule?.blocks} blocks`);

  const fd = new FormData();
  fd.append("file", new Blob([pdfBytes], { type: "application/pdf" }), "electric-potential.pdf");
  const up = await api("/api/sources", { method: "POST", form: fd });
  step(4, up.status === 201 && up.data.source?.embeddingStatus === "stored" && up.data.chunks?.length >= 1, `Upload PDF -> ${up.data.chunks?.length} chunk(s), embeddings ${up.data.source?.embeddingStatus}`);

  const ret = await api("/api/retrieval", { method: "POST", json: { query: "What is the formula for electric potential from a point charge?", sourceLocked: true } });
  const cite = ret.data.citations?.[0]?.reference;
  step(5, ret.data.retrievalMode === "vector" && /electric-potential/.test(cite ?? ""), `Grounded retrieval cites "${cite}"`);
  const unans = await api("/api/retrieval", { method: "POST", json: { query: "What is the capital of France?", sourceLocked: true } });
  step(6, (unans.data.citations?.length ?? 0) === 0, `Unanswerable question declined (no fabricated citation)`);

  const start = await api("/api/resources", { method: "POST", json: { action: "start", topic: "electric potential", goalId, goalType: "exam", need: "conceptual_intuition", level: "CBSE Class 12", minutesAvailable: 30 } });
  const rec = start.data.recommendation;
  const activityId = start.data.activity?.id;
  step(7, !!rec?.selected?.id, `Broker selected external resource "${rec?.selected?.title}" (${rec?.selected?.provider})`);
  step(8, !!rec?.selected?.completionInstructions && !!rec?.selected?.verification?.kind, `Guided task + ${rec?.selected?.verification?.kind} verification contract`);

  await api("/api/resources", { method: "POST", json: { action: "return", activityId, evidence: "Observed equipotential lines perpendicular to field lines." } });
  const expected = rec.selected.verification.expectedAnswer ?? "";
  const verify = await api("/api/resources", { method: "POST", json: { action: "verify", activityId, answer: String(expected) } });
  step(9, verify.data.verified === true, `Return + pass unseen verification`);
  step(10, !!verify.data.mastery && verify.data.mastery.understanding > 0, `Mastery updated -> ${verify.data.mastery?.status} (understanding ${verify.data.mastery?.understanding?.toFixed?.(2)})`);
  step(11, !!verify.data.receipt?.id && verify.data.scheduleUpdate?.status === "scheduled", `Outcome receipt + spaced follow-up scheduled`);
  const learn = await api("/api/state?view=learn");
  step(12, learn.data.data.learningStates?.length >= 1 && learn.data.data.receipts?.length >= 1, `Persisted in app (${learn.data.data.receipts?.length} receipt, ${learn.data.data.learningStates?.length} mastery state)`);

  // MCP continuity via real OAuth for this fresh user
  const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const SCOPES = "goals:read goals:write schedule:read memory:read memory:write learning:read";
  const reg2 = await api("/api/oauth/register", { method: "POST", json: { client_name: "Flow MCP", redirect_uris: ["http://localhost:3000/callback"], scope: SCOPES } });
  const af = new URLSearchParams({ client_id: reg2.data.client_id, redirect_uri: "http://localhost:3000/callback", state: "s", code_challenge: challenge, resource: `${BASE}/api/mcp`, decision: "approve" });
  for (const s of SCOPES.split(" ")) af.append("scope", s);
  const authz = await fetch(`${BASE}/api/oauth/authorize`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie, origin: BASE }, body: af.toString() });
  const code = new URL(authz.headers.get("location")).searchParams.get("code");
  const tok = await (await fetch(`${BASE}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: reg2.data.client_id, redirect_uri: "http://localhost:3000/callback", code_verifier: verifier, resource: `${BASE}/api/mcp` }).toString() })).json();
  let rid = 0;
  const rpc = async (method, params) => {
    const r = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok.access_token}`, origin: BASE, "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) });
    const t = await r.text(); const j = t.includes("data:") ? t.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("") : t;
    return JSON.parse(j);
  };
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "flow", version: "1" } });
  const goalsRead = (await rpc("tools/call", { name: "list_goals", arguments: {} })).result?.structuredContent?.data;
  const mcpGoal = (Array.isArray(goalsRead) ? goalsRead : goalsRead?.goals)?.[0];
  step(13, mcpGoal?.id === goalId, `MCP (real OAuth, PKCE) retrieves the same goal`);
  const sessionId = `session_${Date.now().toString(36)}`;
  const write = await rpc("tools/call", { name: "sync_session", arguments: { sessionId, goalId, summary: "Passed electric-potential checkpoint; scheduling next practice.", conceptsLearned: ["electric potential"], mode: "auto_low_impact" } });
  const receipt = write.result?.structuredContent?.data;
  step(14, !!receipt?.id && !!receipt?.createdAt, `MCP records approved progress update (receipt @ ${receipt?.createdAt})`);
  const appMem = await api("/api/state?view=memory");
  step(15, (appMem.data.data.receipts ?? []).some((r) => r.sessionId === sessionId), `MCP write appears immediately in the standalone app`);

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} steps passed for fresh account ${email}`);
  if (passed !== results.length) process.exit(1);
}
main().catch((e) => { console.error("FLOW ERROR:", e); process.exit(1); });
