"use client";

import type { ResourceActivity, ResourceRecommendation } from "@continuum/schemas";
import { ArrowRight, BookOpen, Check, CheckCircle2, Clock3, ExternalLink, RotateCcw, Search, ShieldCheck, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { PageIntro } from "./page-intro";
import { text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;
type VerificationResult = { verified?: boolean; needsReview?: boolean; scheduleUpdate?: Row };

const needs = [
  ["diagnosis", "Diagnose a misconception"],
  ["conceptual_intuition", "Build conceptual intuition"],
  ["canonical_explanation", "Read a canonical explanation"],
  ["guided_practice", "Do guided practice"],
  ["official_exam_simulation", "Take an official exam simulation"],
  ["source_exploration", "Explore a source set"],
  ["research_evidence", "Find research evidence"],
  ["coding_practice", "Use a coding environment"],
] as const;

export function LearnScreen({ state, showToast }: { state: WorkspaceState; showToast: Toast }) {
  const [topic, setTopic] = useState("");
  const [need, setNeed] = useState("conceptual_intuition");
  const [goalType, setGoalType] = useState("school");
  const [goalId, setGoalId] = useState(text(state.goals[0], "id"));
  const [minutes, setMinutes] = useState(45);
  const [cost, setCost] = useState("free_only");
  const [recommendation, setRecommendation] = useState<ResourceRecommendation>();
  const [activity, setActivity] = useState<ResourceActivity>();
  const [returnEvidence, setReturnEvidence] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [result, setResult] = useState<VerificationResult>();
  const recentActivityId = text(state.resourceActivities.find((item) => !["verified", "abandoned"].includes(text(item, "status"))), "id");

  useEffect(() => {
    if (!recentActivityId || activity || recommendation) return;
    let active = true;
    setResumeBusy(true);
    fetch(`/api/resources?activityId=${encodeURIComponent(recentActivityId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { activity?: ResourceActivity; recommendation?: ResourceRecommendation; error?: string };
        if (!response.ok || !body.activity || !body.recommendation) throw new Error(body.error ?? "The handoff could not be resumed");
        if (active) { setActivity(body.activity); setRecommendation(body.recommendation); }
      })
      .catch((error) => { if (active) showToast(error instanceof Error ? error.message : "The handoff could not be resumed"); })
      .finally(() => { if (active) setResumeBusy(false); });
    return () => { active = false; };
  }, [activity, recentActivityId, recommendation, showToast]);

  function requestBody() {
    return { topic, need, goalType, costPreference: cost, minutesAvailable: minutes, ...(goalId ? { goalId } : {}) };
  }

  async function query() {
    setBusy(true);
    setResult(undefined);
    setActivity(undefined);
    try {
      const params = new URLSearchParams(Object.entries(requestBody()).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
      const response = await fetch(`/api/resources?${params}`, { cache: "no-store" });
      const body = await response.json() as { recommendation?: ResourceRecommendation; error?: string };
      if (!response.ok || !body.recommendation) throw new Error(body.error ?? "No reviewed resource matched this need");
      setRecommendation(body.recommendation);
    } catch (error) { showToast(error instanceof Error ? error.message : "No resource matched"); }
    finally { setBusy(false); }
  }

  async function start() {
    if (!recommendation) return;
    setBusy(true);
    try {
      const response = await fetch("/api/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", ...requestBody() }) });
      const body = await response.json() as { activity?: ResourceActivity; recommendation?: ResourceRecommendation; error?: string };
      if (!response.ok || !body.activity || !body.recommendation) throw new Error(body.error ?? "The guided handoff could not be saved");
      setActivity(body.activity);
      setRecommendation(body.recommendation);
      showToast(body.recommendation.selected.native ? "Native lesson started. Progress remains unverified." : "Handoff saved. Open the resource when you are ready.");
    } catch (error) { showToast(error instanceof Error ? error.message : "The guided handoff could not be saved"); }
    finally { setBusy(false); }
  }

  async function returned() {
    if (!activity) return;
    setBusy(true);
    try {
      const response = await fetch("/api/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "return", activityId: activity.id, evidence: returnEvidence || undefined }) });
      const body = await response.json() as { activity?: ResourceActivity; error?: string };
      if (!response.ok || !body.activity) throw new Error(body.error ?? "The return could not be recorded");
      setActivity(body.activity);
      showToast("Return recorded. Mastery is unchanged until the verification step passes.");
    } catch (error) { showToast(error instanceof Error ? error.message : "The return could not be recorded"); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (!activity || !recommendation) return;
    setBusy(true);
    try {
      const contract = recommendation.selected.verification;
      const numericScore = contract.kind === "score_import" ? Number(answer) : undefined;
      const response = await fetch("/api/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", activityId: activity.id, answer, ...(Number.isFinite(numericScore) ? { score: numericScore } : {}), ...(contract.kind === "artifact" ? { artifactReference: answer } : {}) }) });
      const body = await response.json() as { activity?: ResourceActivity; verified?: boolean; needsReview?: boolean; scheduleUpdate?: Row; error?: string };
      if (!response.ok || !body.activity) throw new Error(body.error ?? "Verification failed");
      setActivity(body.activity);
      setResult(body);
      showToast(body.verified ? "Progress verified. Mastery, memory, receipt, and follow-up are now in sync." : body.needsReview ? "Evidence saved for review; mastery was not changed." : "The checkpoint did not pass; mastery was not changed.");
    } catch (error) { showToast(error instanceof Error ? error.message : "Verification failed"); }
    finally { setBusy(false); }
  }

  function reset() {
    setRecommendation(undefined);
    setActivity(undefined);
    setResult(undefined);
    setAnswer("");
    setReturnEvidence("");
  }

  return (
    <div className="screen">
      <PageIntro eyebrow="LEARN" title="Use the strongest resource, then bring the result back." description="Continuum compares reviewed native and external options by fit, authority, quality, time, access, cost, and a real verification path." />

      <div className="handoff-steps" aria-label="Resource workflow"><span className={!recommendation ? "active" : "done"}><i>1</i>Define the need</span><span className={recommendation && !activity ? "active" : activity ? "done" : ""}><i>2</i>Choose and start</span><span className={activity?.status === "started" ? "active" : activity?.returnedAt ? "done" : ""}><i>3</i>Return with evidence</span><span className={["returned", "needs_review"].includes(activity?.status ?? "") ? "active" : activity?.status === "verified" ? "done" : ""}><i>4</i>Verify progress</span></div>

      {!recommendation ? <Card className="resource-search-card"><div className="resource-form-grid"><label className="resource-topic">What are you trying to learn or complete?<input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={500} placeholder="Electric potential intuition, SAT full test, Python notebook…" /></label><label>Type of help<select value={need} onChange={(event) => setNeed(event.target.value)}>{needs.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Goal context<select value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">No linked goal</option>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</select></label><label>Goal type<select value={goalType} onChange={(event) => setGoalType(event.target.value)}><option value="school">School</option><option value="exam">Exam</option><option value="university">University</option><option value="research">Research</option><option value="coding">Coding</option></select></label><label>Time available<select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}><option value="10">10 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="90">90 minutes</option><option value="180">3 hours</option></select></label><label>Access preference<select value={cost} onChange={(event) => setCost(event.target.value)}><option value="free_only">Free only</option><option value="free_preferred">Prefer free</option><option value="any">Any access</option></select></label></div><div className="resource-search-actions"><p><ShieldCheck size={15} />Only reviewed registry entries can be recommended. If nothing is relevant, Continuum refuses the redirect.</p><Button className="button-primary button-large" disabled={busy || topic.trim().length < 2} onClick={() => void query()}><Search size={16} />{busy ? "Comparing…" : "Compare resources"}</Button></div>{resumeBusy ? <p className="subtle-meta">Restoring your latest handoff…</p> : null}</Card> : null}

      {recommendation ? <Card className="resource-result-card">
        <div className="resource-result-head"><div><Badge tone={recommendation.decision === "external" ? "blue" : "green"}>{recommendation.decision === "external" ? "External resource selected" : "Native lesson selected"}</Badge><span>{recommendation.selected.authority.replaceAll("_", " ")} · reviewed {new Date(recommendation.selected.lastReviewedAt).toLocaleDateString()}</span></div><button onClick={reset}><RotateCcw size={14} />Start over</button></div>
        <div className="resource-title-row"><div><p className="eyebrow">BEST MATCH</p><h2>{recommendation.selected.title}</h2><p>{recommendation.selected.description}</p></div><div className="resource-score"><strong>{Math.round(recommendation.selected.qualityScore * 100)}</strong><span>quality</span></div></div>
        <div className="resource-stats"><span><Clock3 size={15} />{recommendation.selected.estimatedMinutes} min</span><span><Target size={15} />{recommendation.selected.cost}</span><span><ShieldCheck size={15} />{recommendation.selected.provider}</span></div>
        <div className="why-selected"><strong>Why this beats the native option</strong><p>{recommendation.whyBetterThanNative}</p></div>
        <div className="resource-details"><div><strong>Go to this exact place</strong><span>{recommendation.selected.exactLocator.section ?? recommendation.selected.exactLocator.activity ?? recommendation.selected.exactLocator.exercise ?? "Open the linked activity"}</span></div><div><strong>Focus on</strong><ul>{recommendation.selected.focusInstructions.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>Complete before returning</strong><ul>{recommendation.selected.completionInstructions.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>Access needed</strong><ul>{recommendation.selected.accessRequirements.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
        <div className="resource-connection"><div><strong>Goal connection</strong><span>{recommendation.connectedOutcome}</span></div><div><strong>Schedule impact</strong><span>{recommendation.scheduleImpact}</span></div><div><strong>Return check</strong><span>{recommendation.verificationPlan}</span></div></div>

        {!activity ? <div className="resource-actions"><Button className="button-primary button-large" disabled={busy} onClick={() => void start()}>{recommendation.selected.native ? <BookOpen size={16} /> : <Check size={16} />}{busy ? "Saving…" : recommendation.selected.native ? "Start native lesson" : "Save guided handoff"}</Button><small>Starting records the resource and verification contract. It does not grant progress.</small></div> : null}

        {activity?.status === "started" && recommendation.selected.native && recommendation.selected.nativeContent ? <div className="native-lesson">{recommendation.selected.nativeContent.map((block) => <section key={block.heading}><h3>{block.heading}</h3><p>{block.body}</p></section>)}</div> : null}
        {activity?.status === "started" ? <div className="return-panel"><div><Badge tone="orange">Progress unverified</Badge><h3>{recommendation.selected.native ? "Finish the lesson, then return" : "Your handoff is saved"}</h3><p>{recommendation.selected.native ? "Complete the content above." : "Open the reviewed resource in a new tab. Continuum will keep this return point here."}</p>{!recommendation.selected.native ? <a className="button button-primary button-large" href={recommendation.selected.url} target="_blank" rel="noopener noreferrer">Open {recommendation.selected.provider}<ExternalLink size={16} /></a> : null}</div><label>Optional evidence from the activity<textarea value={returnEvidence} onChange={(event) => setReturnEvidence(event.target.value)} placeholder="Exercise number, score, observation, notebook link, or what you completed" /></label><Button className="button-secondary" disabled={busy} onClick={() => void returned()}>{busy ? "Recording…" : "I’m back — record return"}<ArrowRight size={15} /></Button></div> : null}

        {activity && ["returned", "needs_review"].includes(activity.status) ? <div className="verification-panel"><div><Badge tone="blue">Verification required</Badge><h3>Opening a resource is not learning evidence.</h3><p>{recommendation.selected.verification.prompt}</p></div><label>Your answer or artifact reference<input value={answer} onChange={(event) => setAnswer(event.target.value)} /></label><Button className="button-primary" disabled={busy || !answer.trim()} onClick={() => void verify()}><ShieldCheck size={16} />{busy ? "Checking…" : "Verify progress"}</Button></div> : null}

        {result ? <div className={result.verified ? "outcome-receipt success" : "outcome-receipt pending"}>{result.verified ? <CheckCircle2 size={22} /> : <ShieldCheck size={22} />}<div><strong>{result.verified ? "Progress verified and written back" : result.needsReview ? "Evidence saved for review" : "Checkpoint not passed"}</strong><span>{result.verified ? "Mastery, memory, an outcome receipt, and a spaced follow-up now reflect this activity." : "Mastery did not increase. The evidence and audit event were still preserved."}</span></div></div> : null}

        {recommendation.alternatives.length ? <details className="resource-alternatives"><summary>Why the other {recommendation.alternatives.length} option{recommendation.alternatives.length === 1 ? " was" : "s were"} not selected</summary>{recommendation.alternatives.map((alternative) => <div key={alternative.resource.id}><strong>{alternative.resource.title}</strong><span>{alternative.whyNotSelected}</span></div>)}</details> : null}
      </Card> : null}
    </div>
  );
}
