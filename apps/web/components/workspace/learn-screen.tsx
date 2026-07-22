"use client";

import type { ResourceActivity, ResourceRecommendation } from "@continuum/schemas";
import { ArrowRight, BookOpen, BrainCircuit, Check, CheckCircle2, ChevronRight, Clock3, ExternalLink, GraduationCap, LoaderCircle, PlayCircle, RotateCcw, Search, ShieldCheck, Sparkles, Target, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { PageIntro } from "./page-intro";
import { formatLabel, masteryLabel } from "@/lib/labels";
import type { LearningVideo } from "@/lib/youtube";
import { number, text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;
type VerificationResult = { verified?: boolean; needsReview?: boolean; scheduleUpdate?: Row };
type LearnView = "home" | "lesson" | "resource";
type NativeLesson = { id: string; conceptId: string; title: string; explanation: string; checksForUnderstanding: string[]; sourceChunkIds: string[]; evidenceState: string; model: string };
type LessonCheckpoint = { correct: boolean; explanation: string; mastery: Row };
type VideoResponse = { videos: LearningVideo[]; status: "live" | "unconfigured" | "failed"; handoffUrl: string; message?: string; note: string };

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

export function LearnScreen({ state, showToast, onRefresh }: { state: WorkspaceState; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [view, setView] = useState<LearnView>("home");
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
  const [lesson, setLesson] = useState<NativeLesson>();
  const [lessonBusy, setLessonBusy] = useState(false);
  const [lessonRead, setLessonRead] = useState(false);
  const [checkpointAnswer, setCheckpointAnswer] = useState("");
  const [checkpoint, setCheckpoint] = useState<LessonCheckpoint>();
  const [videoQuery, setVideoQuery] = useState("electric potential CBSE Class 12");
  const [videos, setVideos] = useState<VideoResponse>();
  const [videoBusy, setVideoBusy] = useState(false);
  const recentActivityId = text(state.resourceActivities.find((item) => !["verified", "abandoned"].includes(text(item, "status"))), "id");
  const focusLearning = state.learningStates.find((item) => text(item, "conceptId").includes("potential")) ?? state.learningStates[0];

  useEffect(() => {
    if (!recentActivityId || activity || recommendation) return;
    let active = true;
    setResumeBusy(true);
    fetch(`/api/resources?activityId=${encodeURIComponent(recentActivityId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { activity?: ResourceActivity; recommendation?: ResourceRecommendation; error?: string };
        if ([404, 409].includes(response.status)) return;
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
      setView("resource");
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
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "Verification failed"); }
    finally { setBusy(false); }
  }

  function reset() {
    setRecommendation(undefined);
    setActivity(undefined);
    setResult(undefined);
    setAnswer("");
    setReturnEvidence("");
    setView("resource");
  }

  async function openLesson() {
    setLessonBusy(true);
    setCheckpoint(undefined);
    setCheckpointAnswer("");
    try {
      const response = await fetch("/api/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "lesson", liveAi: false }) });
      const body = await response.json() as { lesson?: NativeLesson; error?: string };
      if (!response.ok || !body.lesson) throw new Error(body.error ?? "The lesson could not be loaded.");
      setLesson(body.lesson);
      setView("lesson");
    } catch (error) { showToast(error instanceof Error ? error.message : "The lesson could not be loaded."); }
    finally { setLessonBusy(false); }
  }

  async function markLessonRead() {
    setLessonBusy(true);
    try {
      const response = await fetch("/api/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "lesson_read" }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The lesson checkpoint could not be opened.");
      setLessonRead(true);
      showToast("Lesson read recorded. Transfer mastery is unchanged until the unseen check passes.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The lesson checkpoint could not be opened."); }
    finally { setLessonBusy(false); }
  }

  async function checkLesson() {
    setLessonBusy(true);
    try {
      const response = await fetch("/api/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "checkpoint", answer: checkpointAnswer }) });
      const body = await response.json() as LessonCheckpoint & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The checkpoint could not be graded.");
      setCheckpoint(body);
      showToast(body.correct ? "Unseen checkpoint passed. Transfer mastery is updated." : "Not yet. Mastery was not increased.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The checkpoint could not be graded."); }
    finally { setLessonBusy(false); }
  }

  async function searchVideos(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVideoBusy(true);
    try {
      const response = await fetch(`/api/learning/videos?q=${encodeURIComponent(videoQuery)}`, { cache: "no-store" });
      const body = await response.json() as VideoResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Video search could not be completed.");
      setVideos(body);
    } catch (error) { showToast(error instanceof Error ? error.message : "Video search could not be completed."); }
    finally { setVideoBusy(false); }
  }

  function continueTask(task: Row) {
    setTopic(text(task, "title"));
    setGoalId(text(task, "goalId"));
    setNeed("guided_practice");
    setView("resource");
  }

  return (
    <div className="screen learn-screen premium-screen">
      <PageIntro eyebrow="LEARN" title="Know what to learn next—and why." description="Continue a curriculum path, repair a misconception, or leave with a guided resource and return checkpoint." action={<div className="learn-view-actions"><button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>Learning home</button><button className={view === "resource" ? "active" : ""} onClick={() => setView("resource")}>Find a resource</button></div>} />

      {view === "home" && !recommendation ? <div className="learn-home">
        <section className="learn-home-hero">
          <Card className="continue-learning-card"><div className="learn-card-label"><Sparkles size={15} />CONTINUE LEARNING</div><div className="continue-learning-body"><div><Badge tone="orange">Misconception to fix</Badge><h2>Electric potential vs potential energy</h2><p>At one location, potential stays fixed. Energy changes with the charge you place there.</p></div><div className="mastery-ring" style={{ "--mastery": `${Math.round(number(focusLearning, "understanding", .52) * 100)}%` } as React.CSSProperties}><strong>{Math.round(number(focusLearning, "understanding", .52) * 100)}%</strong><span>understanding</span></div></div><div className="continue-learning-actions"><Button className="button-primary" disabled={lessonBusy} onClick={() => void openLesson()}>{lessonBusy ? <LoaderCircle className="spin" size={16} /> : <BookOpen size={16} />}Open 6-min lesson</Button><button onClick={() => { setTopic("electric potential and potential energy"); setNeed("conceptual_intuition"); setView("resource"); }}>Compare resources <ChevronRight size={15} /></button></div></Card>
          <Card className="learning-signal-card"><div className="learn-card-label"><BrainCircuit size={15} />CURRENT SIGNAL</div><strong>{masteryLabel(text(focusLearning, "status", "not_started"))}</strong><p>{text(focusLearning, "explanation", "Continuum needs an unseen checkpoint before it can claim transfer.")}</p><div><span>Exposure <b>{Math.round(number(focusLearning, "exposure", 0) * 100)}%</b></span><span>Transfer <b>{Math.round(number(focusLearning, "transfer", 0) * 100)}%</b></span><span>Retention <b>{Math.round(number(focusLearning, "retention", 0) * 100)}%</b></span></div></Card>
        </section>

        <section className="learning-home-section"><div className="section-heading"><div><p className="eyebrow">YOUR PATHS</p><h2>Continue from active goals</h2></div></div><div className="learning-path-grid">{state.goals.slice(0, 3).map((goal) => { const goalTasks = state.tasks.filter((task) => text(task, "goalId") === text(goal, "id") && text(task, "status") !== "done"); const next = goalTasks[0]; return <Card className="learning-path-card" key={text(goal, "id")}><span><GraduationCap size={18} /></span><div><small>{formatLabel(text(goal, "status", "active"))} path</small><h3>{text(goal, "title")}</h3><p>{next ? text(next, "title") : "No unfinished learning task"}</p></div><button disabled={!next} onClick={() => next && continueTask(next)}>Continue <ChevronRight size={15} /></button></Card>;})}</div></section>

        <section className="learning-home-section"><div className="section-heading"><div><p className="eyebrow">VIDEO EXPLORATION</p><h2>Find a visual explanation</h2><p className="section-description">Provider results stay separate from verified curriculum progress.</p></div></div><Card className="learning-video-search"><form onSubmit={searchVideos}><label><Video size={17} /><input value={videoQuery} onChange={(event) => setVideoQuery(event.target.value)} minLength={2} maxLength={300} aria-label="Video topic" /><Button className="button-primary" disabled={videoBusy}>{videoBusy ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}{videoBusy ? "Searching…" : "Search videos"}</Button></label></form>{videos ? <><div className="video-provider-row"><span className={`provider-status ${videos.status}`}><i />YouTube: {videos.status}</span><small>{videos.note}</small></div>{videos.videos.length ? <div className="learning-video-grid">{videos.videos.map((video) => <article key={video.id}>{video.thumbnailUrl ? <span className="video-thumbnail" role="img" aria-label={`Thumbnail for ${video.title}`} style={{ backgroundImage: `url(${JSON.stringify(video.thumbnailUrl)})` }} /> : <span className="video-placeholder"><PlayCircle size={28} /></span>}<div><Badge tone={video.reviewState === "trusted_channel" ? "green" : "neutral"}>{video.reviewState === "trusted_channel" ? "Trusted channel" : "Provider result"}</Badge><h3>{video.title}</h3><p>{video.channelTitle}</p><a href={video.watchUrl} target="_blank" rel="noreferrer">Watch on YouTube <ExternalLink size={13} /></a></div></article>)}</div> : <div className="video-unconfigured"><Video size={21} /><div><strong>{videos.status === "unconfigured" ? "YouTube API key not configured" : "No embeddable results returned"}</strong><p>{videos.message ?? "Review search results directly before choosing a video."}</p></div><a className="button button-secondary" href={videos.handoffUrl} target="_blank" rel="noreferrer">Open YouTube search <ExternalLink size={14} /></a></div>}</> : <div className="video-search-empty"><PlayCircle size={23} /><p>Search uses YouTube’s official API when configured. Results do not raise mastery until you return with evidence.</p></div>}</Card></section>

        {state.resourceActivities.length ? <section className="learning-home-section"><div className="section-heading"><div><p className="eyebrow">RECENT LEARNING</p><h2>Evidence-producing activity</h2></div></div><div className="recent-learning-strip">{state.resourceActivities.slice(0, 4).map((item) => <Card key={text(item, "id")}><span><CheckCircle2 size={16} /></span><div><strong>{formatLabel(text(item, "status", "started"))}</strong><p>{text(item, "resourceId", "Guided resource activity")}</p></div><small>{item.startedAt ? new Date(String(item.startedAt)).toLocaleDateString() : ""}</small></Card>)}</div></section> : null}
      </div> : null}

      {view === "lesson" && lesson ? <Card className="native-lesson-screen"><header><button onClick={() => setView("home")}><ArrowRight size={15} />Learning home</button><Badge tone="green">Reviewed curriculum</Badge></header><div className="lesson-title-block"><div className="learn-card-label"><BookOpen size={15} />TARGETED MICRO-LESSON</div><h2>{lesson.title}</h2><p>{lesson.explanation}</p></div><div className="lesson-contrast-grid"><section><span>V</span><h3>Potential belongs to a place</h3><p>It describes the source charges and location. At a fixed point, changing the test charge does not change V.</p></section><section><span>U</span><h3>Energy belongs to a charge at that place</h3><p>U = qV. Doubling q doubles U, and a negative charge changes its sign.</p></section></div><div className="lesson-proof"><ShieldCheck size={18} /><div><strong>Source-locked lesson</strong><p>{lesson.evidenceState === "direct_support" ? "Directly supported" : formatLabel(lesson.evidenceState)} · {lesson.sourceChunkIds.join(", ")} · {lesson.model}</p></div></div><div className="lesson-understanding"><h3>Check for understanding</h3><p>{lesson.checksForUnderstanding[0]}</p>{!lessonRead ? <Button className="button-primary" disabled={lessonBusy} onClick={() => void markLessonRead()}><Check size={15} />I can explain the contrast</Button> : <div className="lesson-checkpoint"><label>Unseen check: using k = 9×10⁹, what is V at 0.75 m from a +2 nC point charge?<div><input value={checkpointAnswer} onChange={(event) => setCheckpointAnswer(event.target.value)} inputMode="decimal" placeholder="Answer in volts" /><Button className="button-primary" disabled={lessonBusy || !checkpointAnswer.trim()} onClick={() => void checkLesson()}>{lessonBusy ? "Checking…" : "Check answer"}</Button></div></label>{checkpoint ? <div className={checkpoint.correct ? "checkpoint-result success" : "checkpoint-result retry"}>{checkpoint.correct ? <CheckCircle2 size={19} /> : <RotateCcw size={19} />}<div><strong>{checkpoint.correct ? "Transfer checkpoint passed" : "Try the relationship again"}</strong><p>{checkpoint.explanation}</p></div></div> : null}</div>}</div></Card> : null}

      {view === "resource" || recommendation ? <div className="handoff-steps" aria-label="Resource workflow"><span className={!recommendation ? "active" : "done"}><i>1</i>Define the need</span><span className={recommendation && !activity ? "active" : activity ? "done" : ""}><i>2</i>Choose and start</span><span className={activity?.status === "started" ? "active" : activity?.returnedAt ? "done" : ""}><i>3</i>Return with evidence</span><span className={["returned", "needs_review"].includes(activity?.status ?? "") ? "active" : activity?.status === "verified" ? "done" : ""}><i>4</i>Verify progress</span></div> : null}

      {!recommendation && view === "resource" ? <Card className="resource-search-card"><div className="resource-search-heading"><button onClick={() => setView("home")}><ArrowRight size={14} />Learning home</button><div><p className="eyebrow">GUIDED RESOURCE FINDER</p><h2>Match the resource to the job</h2><p>Continuum compares only reviewed registry entries and refuses weak matches.</p></div></div><div className="resource-form-grid"><label className="resource-topic">What are you trying to learn or complete?<input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={500} placeholder="Electric potential intuition, SAT full test, Python notebook…" /></label><label>Type of help<select value={need} onChange={(event) => setNeed(event.target.value)}>{needs.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Goal context<select value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">No linked goal</option>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</select></label><label>Goal type<select value={goalType} onChange={(event) => setGoalType(event.target.value)}><option value="school">School</option><option value="exam">Exam</option><option value="university">University</option><option value="research">Research</option><option value="coding">Coding</option></select></label><label>Time available<select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}><option value="10">10 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="90">90 minutes</option><option value="180">3 hours</option></select></label><label>Access preference<select value={cost} onChange={(event) => setCost(event.target.value)}><option value="free_only">Free only</option><option value="free_preferred">Prefer free</option><option value="any">Any access</option></select></label></div><div className="resource-search-actions"><p><ShieldCheck size={15} />Starting creates a return checkpoint. Opening a link never counts as mastery.</p><Button className="button-primary button-large" disabled={busy || topic.trim().length < 2} onClick={() => void query()}><Search size={16} />{busy ? "Comparing…" : "Compare resources"}</Button></div>{resumeBusy ? <p className="subtle-meta">Restoring your latest handoff…</p> : null}</Card> : null}

      {recommendation ? <Card className="resource-result-card">
        <div className="resource-result-head"><div><Badge tone={recommendation.decision === "external" ? "blue" : "green"}>{recommendation.decision === "external" ? "External resource selected" : "Native lesson selected"}</Badge><span>{formatLabel(recommendation.selected.authority)} · reviewed {new Date(recommendation.selected.lastReviewedAt).toLocaleDateString()}</span></div><button onClick={reset}><RotateCcw size={14} />Start over</button></div>
        <div className="resource-title-row"><div><p className="eyebrow">BEST MATCH</p><h2>{recommendation.selected.title}</h2><p>{recommendation.selected.description}</p></div><div className="resource-score"><strong>{Math.round(recommendation.selected.qualityScore * 100)}</strong><span>quality</span></div></div>
        <div className="resource-stats"><span><Clock3 size={15} />{recommendation.selected.estimatedMinutes} min</span><span><Target size={15} />{formatLabel(recommendation.selected.cost)}</span><span><ShieldCheck size={15} />{recommendation.selected.provider}</span></div>
        <div className="why-selected"><strong>Why this beats the native option</strong><p>{recommendation.whyBetterThanNative}</p></div>
        <div className="resource-details"><div><strong>Go to this exact place</strong><span>{recommendation.selected.exactLocator.section ?? recommendation.selected.exactLocator.activity ?? recommendation.selected.exactLocator.exercise ?? "Open the linked activity"}</span></div><div><strong>Focus on</strong><ul>{recommendation.selected.focusInstructions.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>Complete before returning</strong><ul>{recommendation.selected.completionInstructions.map((item) => <li key={item}>{item}</li>)}</ul></div><div><strong>Access needed</strong><ul>{recommendation.selected.accessRequirements.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
        <div className="resource-connection"><div><strong>Goal connection</strong><span>{recommendation.connectedOutcome}</span></div><div><strong>Schedule impact</strong><span>{recommendation.scheduleImpact}</span></div><div><strong>Return check</strong><span>{recommendation.verificationPlan}</span></div></div>

        {!activity ? <div className="resource-actions"><Button className="button-primary button-large" disabled={busy} onClick={() => void start()}>{recommendation.selected.native ? <BookOpen size={16} /> : <Check size={16} />}{busy ? "Saving…" : recommendation.selected.native ? "Start native lesson" : "Save guided handoff"}</Button><small>Starting records the resource and verification contract. It does not grant progress.</small></div> : null}

        {activity?.status === "started" && recommendation.selected.native && recommendation.selected.nativeContent ? <div className="native-lesson">{recommendation.selected.nativeContent.map((block) => <section key={block.heading}><h3>{block.heading}</h3><p>{block.body}</p></section>)}</div> : null}
        {activity?.status === "started" ? <div className="return-panel"><div><Badge tone="orange">Progress unverified</Badge><h3>{recommendation.selected.native ? "Finish the lesson, then return" : "Your handoff is saved"}</h3><p>{recommendation.selected.native ? "Complete the content above." : "Open the reviewed resource in a new tab. Continuum will keep this return point here."}</p>{!recommendation.selected.native ? <a className="button button-primary button-large" href={recommendation.selected.url} target="_blank" rel="noopener noreferrer">Open {recommendation.selected.provider}<ExternalLink size={16} /></a> : null}</div><label>Optional evidence from the activity<textarea value={returnEvidence} onChange={(event) => setReturnEvidence(event.target.value)} placeholder="Exercise number, score, observation, notebook link, or what you completed" /></label><Button className="button-secondary" disabled={busy} onClick={() => void returned()}>{busy ? "Recording…" : "I’m back — record return"}<ArrowRight size={15} /></Button></div> : null}

        {activity && ["returned", "needs_review"].includes(activity.status) ? <div className="verification-panel"><div><Badge tone="blue">Verification required</Badge><h3>Opening a resource is not learning evidence.</h3><p>{recommendation.selected.verification.prompt}</p></div><label>Your answer or artifact reference<input value={answer} onChange={(event) => setAnswer(event.target.value)} /></label><Button className="button-primary" disabled={busy || !answer.trim()} onClick={() => void verify()}><ShieldCheck size={16} />{busy ? "Checking…" : "Verify progress"}</Button></div> : null}

        {result ? <div className={result.verified ? "outcome-receipt success" : "outcome-receipt pending"}>{result.verified ? <CheckCircle2 size={22} /> : <ShieldCheck size={22} />}<div><strong>{result.verified ? "Progress verified and written back" : result.needsReview ? "Evidence saved for review" : "Checkpoint not passed"}</strong><span>{result.verified ? result.scheduleUpdate?.status === "scheduled" ? "Mastery, memory, an outcome receipt, and a spaced follow-up now reflect this activity." : "Mastery, memory, and an outcome receipt are updated. Link future activities to a goal to schedule the follow-up automatically." : "Mastery did not increase. The evidence and audit event were still preserved."}</span></div></div> : null}

        {recommendation.alternatives.length ? <details className="resource-alternatives"><summary>Why the other {recommendation.alternatives.length} option{recommendation.alternatives.length === 1 ? " was" : "s were"} not selected</summary>{recommendation.alternatives.map((alternative) => <div key={alternative.resource.id}><strong>{alternative.resource.title}</strong><span>{alternative.whyNotSelected}</span></div>)}</details> : null}
      </Card> : null}
    </div>
  );
}
