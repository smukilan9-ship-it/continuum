"use client";

import type { ResourceActivity, ResourceRecommendation } from "@continuum/schemas";
import { ArrowLeft, ArrowRight, BookOpen, BrainCircuit, Check, CheckCircle2, ChevronRight, Clock3, ExternalLink, GraduationCap, HelpCircle, LoaderCircle, PlayCircle, RotateCcw, Search, ShieldCheck, Sparkles, Target, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmationDialog, EmptyState, ErrorState, LoadingButton, Modal, SuccessState, Tooltip } from "@/components/ui";
import { PageHeader } from "./page-header";
import { formatLabel, masteryLabel } from "@/lib/labels";
import type { LearningVideo } from "@/lib/youtube";
import { list, number, text, type Row, type WorkspaceState } from "./types";
import { QuestionBankPanel } from "./question-bank-panel";
import { AskQuestionDialog } from "./ask-question-dialog";
import { ConceptMap, type ConceptNode } from "./concept-map";

type Toast = (message: string | null) => void;
type VerificationResult = {
  verified?: boolean;
  outcome?: "verified" | "recorded" | "not_sufficient";
  message?: string;
  explanation?: string;
  masteryBefore?: Row;
  mastery?: Row;
  receipt?: Row;
  scheduleUpdate?: Row;
};
type LearnView = "home" | "lesson" | "resource";
type NativeLesson = { id: string; conceptId: string; title: string; explanation: string; checksForUnderstanding: string[]; sourceChunkIds: string[]; evidenceState: string; model: string; durationMinutes?: number; objectives?: string[]; sections?: Array<{ heading: string; body: string }>; examples?: string[] };
type LessonCheckpoint = { correct: boolean; explanation: string; mastery: Row };
type VideoResponse = { videos: LearningVideo[]; status: "live" | "unconfigured" | "failed"; handoffUrl: string; message?: string; note: string };

const intentions = [
  ["concept", "conceptual_intuition", "Learn a concept", "Understand an idea clearly"],
  ["practice", "guided_practice", "Practise questions", "Build confidence by doing"],
  ["weak_area", "diagnosis", "Fix a weak area", "Target a misconception or gap"],
  ["test", "official_exam_simulation", "Prepare for a test", "Use exam-aligned practice"],
  ["assignment", "guided_practice", "Complete an assignment", "Finish a defined piece of work"],
  ["resource", "canonical_explanation", "Find a resource", "Choose a reviewed explanation"],
] as const;

const rejectionOptions = [
  ["too_long", "Too long"],
  ["too_easy", "Too easy"],
  ["too_difficult", "Too difficult"],
  ["already_used", "I already used it"],
  ["different_format", "I want a different format"],
  ["cannot_access", "I cannot access it"],
  ["not_relevant", "Not relevant enough"],
  ["other", "Other"],
] as const;

const goalStopWords = new Set(["about", "after", "and", "before", "build", "class", "complete", "finish", "for", "from", "learn", "master", "project", "score", "study", "the", "this", "what", "with", "your"]);

function goalMatchScore(query: string, goal: Row) {
  const terms = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !goalStopWords.has(term)));
  if (!terms.size) return 0;
  const goalText = `${text(goal, "title")} ${text(goal, "outcome")}`.toLowerCase();
  return [...terms].filter((term) => goalText.includes(term)).length;
}

export function LearnScreen({ state, userId, showToast, onRefresh }: { state: WorkspaceState; userId: string; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [view, setView] = useState<LearnView>("home");
  const [tool, setTool] = useState<"map" | "banks" | "videos" | "activity">("map");
  const [topic, setTopic] = useState("");
  const [need, setNeed] = useState("");
  const [intent, setIntent] = useState("");
  const goalType = "school";
  const [goalId, setGoalId] = useState(text(state.goals[0], "id"));
  const [goalOverridden, setGoalOverridden] = useState(false);
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
  const [lessonRead, setLessonRead] = useState(() => state.learningStates.some((item) => text(item, "conceptId").includes("potential") && number(item, "exposure", 0) > 0));
  const [checkpointAnswer, setCheckpointAnswer] = useState("");
  const [checkpoint, setCheckpoint] = useState<LessonCheckpoint>();
  const [videoQuery, setVideoQuery] = useState("electric potential CBSE Class 12");
  const [videos, setVideos] = useState<VideoResponse>();
  const [videoBusy, setVideoBusy] = useState(false);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionNote, setRejectionNote] = useState("");
  const [preferredFormat, setPreferredFormat] = useState("");
  const [preferences, setPreferences] = useState<{ excludeResourceIds: string[]; rejectionReasons: string[]; feedback?: string; preferredFormats?: string[] }>({ excludeResourceIds: [], rejectionReasons: [] });
  const [changedPreference, setChangedPreference] = useState("");
  const [confirmGoalChange, setConfirmGoalChange] = useState(false);
  const [showResultReview, setShowResultReview] = useState(false);
  const [resumeActivityId, setResumeActivityId] = useState("");
  const [resumeRequested, setResumeRequested] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askSelection, setAskSelection] = useState("");
  const [askConceptId, setAskConceptId] = useState("concept_potential");
  const recentActivityId = text(state.resourceActivities.find((item) => !["verified", "abandoned"].includes(text(item, "status"))), "id");
  const activityToResume = resumeActivityId || (resumeRequested ? recentActivityId : "");
  const focusLearning = state.learningStates.find((item) => text(item, "conceptId").includes("potential")) ?? state.learningStates[0];

  /**
   * One honest composite state for the focus concept.
   *
   * The signal panel used to read "100% understanding · Mastered" beside a card
   * tagging the same concept "Misconception to fix". A concept carrying an open
   * misconception is never mastered, and the composite is capped to say so; the
   * sub-scores move into the tooltip.
   */
  const focusSignal = useMemo(() => {
    const conceptId = text(focusLearning, "conceptId");
    const openMisconception = state.learningStates.some((item) => text(item, "conceptId") === conceptId && text(item, "misconceptionStatus") === "active")
      || list(focusLearning, "misconceptions").length > 0;
    const exposure = Math.round(number(focusLearning, "exposure", 0) * 100);
    const transfer = Math.round(number(focusLearning, "transfer", 0) * 100);
    const retention = Math.round(number(focusLearning, "retention", 0) * 100);
    const raw = Math.round(number(focusLearning, "understanding", (exposure + transfer + retention) / 300) * 100);
    const composite = openMisconception ? Math.min(raw, 70) : raw;
    const status = text(focusLearning, "status", "not_started");
    return {
      conceptId,
      exposure,
      transfer,
      retention,
      composite,
      // An open misconception outranks the aggregate score in what it tells you to do.
      label: openMisconception ? "Misconception to fix" : masteryLabel(status),
      tone: openMisconception ? "orange" : status === "mastered" ? "green" : "neutral",
      title: text(focusLearning, "conceptLabel", "Electric potential vs potential energy"),
      body: text(focusLearning, "explanation", "At one location, potential stays fixed. Energy changes with the charge you place there."),
    };
  }, [focusLearning, state.learningStates]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(`continuum.learn-session.v1.${userId}`) ?? "null") as Record<string, unknown> | null;
      if (saved) {
        if (["home", "lesson", "resource"].includes(String(saved.view))) setView(saved.view as LearnView);
        if (typeof saved.topic === "string") setTopic(saved.topic);
        if (typeof saved.need === "string") setNeed(saved.need);
        if (typeof saved.intent === "string") setIntent(saved.intent);
        if (typeof saved.goalId === "string") setGoalId(saved.goalId);
        if (typeof saved.goalOverridden === "boolean") setGoalOverridden(saved.goalOverridden);
        if (typeof saved.minutes === "number") setMinutes(saved.minutes);
        if (typeof saved.cost === "string") setCost(saved.cost);
        if (typeof saved.returnEvidence === "string") setReturnEvidence(saved.returnEvidence);
        if (typeof saved.answer === "string") setAnswer(saved.answer);
        if (typeof saved.checkpointAnswer === "string") setCheckpointAnswer(saved.checkpointAnswer);
        if (typeof saved.videoQuery === "string") setVideoQuery(saved.videoQuery);
        if (typeof saved.lessonRead === "boolean") setLessonRead(saved.lessonRead);
        if (typeof saved.rejectionOpen === "boolean") setRejectionOpen(saved.rejectionOpen);
        if (typeof saved.rejectionReason === "string") setRejectionReason(saved.rejectionReason);
        if (typeof saved.rejectionNote === "string") setRejectionNote(saved.rejectionNote);
        if (typeof saved.preferredFormat === "string") setPreferredFormat(saved.preferredFormat);
        if (typeof saved.resumeActivityId === "string") setResumeActivityId(saved.resumeActivityId);
        if (saved.recommendation && typeof saved.recommendation === "object") setRecommendation(saved.recommendation as ResourceRecommendation);
        if (saved.lesson && typeof saved.lesson === "object") setLesson(saved.lesson as NativeLesson);
        if (saved.checkpoint && typeof saved.checkpoint === "object") setCheckpoint(saved.checkpoint as LessonCheckpoint);
        if (saved.videos && typeof saved.videos === "object") setVideos(saved.videos as VideoResponse);
        if (saved.preferences && typeof saved.preferences === "object") setPreferences(saved.preferences as typeof preferences);
        if (typeof saved.changedPreference === "string") setChangedPreference(saved.changedPreference);
      }
    } catch {
      // A corrupt local draft must never block the server-backed Learn workspace.
    }
    setDraftRestored(true);
  }, [userId]);

  useEffect(() => {
    if (!draftRestored) return;
    try {
      window.localStorage.setItem(`continuum.learn-session.v1.${userId}`, JSON.stringify({
        view, topic, need, intent, goalId, goalOverridden, minutes, cost, recommendation: activity ? undefined : recommendation,
        returnEvidence, answer, checkpointAnswer, checkpoint, videoQuery, videos, lesson, lessonRead, preferences,
        rejectionOpen, rejectionReason, rejectionNote, preferredFormat,
        changedPreference, resumeActivityId: activity?.id ?? resumeActivityId,
      }));
    } catch {
      // Continue in memory if storage is unavailable or full.
    }
  }, [activity, answer, changedPreference, checkpoint, checkpointAnswer, cost, draftRestored, goalId, goalOverridden, intent, lesson, lessonRead, minutes, need, preferences, preferredFormat, recommendation, rejectionNote, rejectionOpen, rejectionReason, resumeActivityId, returnEvidence, topic, userId, videoQuery, videos, view]);

  useEffect(() => {
    if (goalOverridden || topic.trim().length < 3) return;
    const ranked = state.goals.map((goal) => ({ id: text(goal, "id"), score: goalMatchScore(topic, goal) })).sort((left, right) => right.score - left.score);
    setGoalId(ranked[0]?.score ? ranked[0].id : "");
  }, [goalOverridden, state.goals, topic]);

  useEffect(() => {
    if (view !== "resource" || !activityToResume || activity || recommendation) return;
    let active = true;
    setResumeBusy(true);
    fetch(`/api/resources?activityId=${encodeURIComponent(activityToResume)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { activity?: ResourceActivity; recommendation?: ResourceRecommendation; error?: string };
        if ([404, 409].includes(response.status)) return;
        if (!response.ok || !body.activity || !body.recommendation) throw new Error(body.error ?? "The handoff could not be resumed");
        if (active) {
          setActivity(body.activity);
          setRecommendation(body.recommendation);
          setResumeActivityId(body.activity.id);
          if (body.activity.status === "verified") setResult({ verified: true, outcome: "verified", explanation: "This activity and its completion evidence were verified and saved to your learning memory." });
          if (body.activity.status === "needs_review") setResult({ verified: false, outcome: "recorded", explanation: "This evidence is saved, but its format cannot be checked automatically. Add deterministic output or complete the requested checkpoint to verify it." });
        }
      })
      .catch((error) => { if (active) showToast(error instanceof Error ? error.message : "The handoff could not be resumed"); })
      .finally(() => { if (active) setResumeBusy(false); });
    return () => { active = false; };
  }, [activity, activityToResume, recommendation, showToast, view]);

  function inferredGoalType() {
    const topicContext = topic.toLowerCase();
    if (/sat|test|exam|neet|jee/.test(topicContext)) return "exam";
    if (/research|paper|thesis|oasis/.test(topicContext)) return "research";
    if (/code|python|sql|program/.test(topicContext)) return "coding";
    if (topicContext.trim()) return goalType;
    const goalContext = text(state.goals.find((goal) => text(goal, "id") === goalId), "title").toLowerCase();
    if (/sat|test|exam|neet|jee/.test(goalContext)) return "exam";
    if (/research|paper|thesis|oasis/.test(goalContext)) return "research";
    if (/code|python|sql|program/.test(goalContext)) return "coding";
    return goalType;
  }

  function effectiveGoalId() {
    if (goalOverridden) return goalId;
    const ranked = state.goals.map((goal) => ({ id: text(goal, "id"), score: goalMatchScore(topic, goal) })).sort((left, right) => right.score - left.score);
    return ranked[0]?.score ? ranked[0].id : "";
  }

  function requestBody(nextPreferences = preferences, minutesForRequest = minutes) {
    const linkedGoalId = effectiveGoalId();
    return {
      topic,
      need,
      goalType: inferredGoalType(),
      costPreference: cost,
      minutesAvailable: minutesForRequest,
      ...nextPreferences,
      ...(linkedGoalId ? { goalId: linkedGoalId } : {}),
    };
  }

  async function query(nextPreferences = preferences, minutesForRequest = minutes) {
    setBusy(true);
    setResult(undefined);
    setActivity(undefined);
    try {
      const params = new URLSearchParams(Object.entries(requestBody(nextPreferences, minutesForRequest)).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : String(value)]));
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
      setResumeActivityId(body.activity.id);
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
      const response = await fetch("/api/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", activityId: activity.id, answer, ...(contract.kind === "artifact" ? { artifactReference: answer } : {}) }) });
      const body = await response.json() as { activity?: ResourceActivity; error?: string } & VerificationResult;
      if (!response.ok || !body.activity) throw new Error(body.error ?? "Verification failed");
      setActivity(body.activity);
      setResult(body);
      showToast(body.message ?? (body.verified ? "Progress verified." : "Evidence updated."));
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "Verification failed"); }
    finally { setBusy(false); }
  }

  function changeLearningGoal() {
    setRecommendation(undefined);
    setActivity(undefined);
    setResult(undefined);
    setAnswer("");
    setReturnEvidence("");
    setPreferences({ excludeResourceIds: [], rejectionReasons: [] });
    setChangedPreference("");
    setResumeActivityId("");
    setResumeRequested(false);
    setGoalOverridden(false);
    setNeed("");
    setIntent("");
    setView("resource");
  }

  function requestGoalChange() {
    if (activity || answer.trim() || returnEvidence.trim()) setConfirmGoalChange(true);
    else changeLearningGoal();
  }

  async function findDifferentResource() {
    if (!recommendation || !rejectionReason) return;
    const format = preferredFormat ? [preferredFormat] : undefined;
    const nextPreferences = {
      excludeResourceIds: [...new Set([...preferences.excludeResourceIds, recommendation.selected.id])],
      rejectionReasons: [...preferences.rejectionReasons, rejectionReason],
      ...(rejectionNote.trim() ? { feedback: rejectionNote.trim() } : {}),
      ...(format ? { preferredFormats: format } : {}),
    };
    const nextMinutes = rejectionReason === "too_long" ? Math.max(15, Math.min(minutes, recommendation.selected.estimatedMinutes - 1)) : minutes;
    if (rejectionReason === "too_long") setMinutes(nextMinutes);
    if (rejectionReason === "cannot_access") setCost("free_only");
    setPreferences(nextPreferences);
    const label = rejectionOptions.find(([value]) => value === rejectionReason)?.[1] ?? "Your feedback";
    setChangedPreference(`${label}${preferredFormat ? ` · prefer ${formatLabel(preferredFormat)}` : ""}${rejectionNote.trim() ? ` · “${rejectionNote.trim()}”` : ""}`);
    setRejectionOpen(false);
    setRejectionReason("");
    setRejectionNote("");
    setPreferredFormat("");
    setRecommendation(undefined);
    setActivity(undefined);
    setResult(undefined);
    await query(nextPreferences, nextMinutes);
  }

  async function continueLearning() {
    await onRefresh();
    setRecommendation(undefined);
    setActivity(undefined);
    setResult(undefined);
    setAnswer("");
    setReturnEvidence("");
    setChangedPreference("");
    setResumeActivityId("");
    setResumeRequested(false);
    setGoalOverridden(false);
    setView("home");
  }

  function askAsQuestion(selection: string, conceptId = lesson?.conceptId ?? "concept_potential") {
    setAskSelection(selection);
    setAskConceptId(conceptId);
    setAskOpen(true);
  }

  async function openLesson(node?: ConceptNode) {
    setLessonBusy(true);
    setCheckpoint(undefined);
    setCheckpointAnswer("");
    try {
      const response = await fetch("/api/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "lesson", liveAi: Boolean(node), ...(node ? { topic: node.name, description: node.description } : {}) }) });
      const body = await response.json() as { lesson?: NativeLesson; error?: string };
      if (!response.ok || !body.lesson) throw new Error(body.error ?? "The lesson could not be loaded.");
      setLesson(body.lesson);
      setLessonRead(state.learningStates.some((item) => text(item, "conceptId") === body.lesson!.conceptId && number(item, "exposure") > 0));
      setView("lesson");
    } catch (error) { showToast(error instanceof Error ? error.message : "The lesson could not be loaded."); }
    finally { setLessonBusy(false); }
  }

  async function markLessonRead() {
    setLessonBusy(true);
    try {
      const response = await fetch("/api/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "lesson_read", conceptId: lesson?.conceptId ?? "concept_potential" }) });
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
    setRecommendation(undefined);
    setActivity(undefined);
    setResumeActivityId("");
    setResumeRequested(false);
    setGoalOverridden(true);
    setTopic(text(task, "title"));
    setGoalId(text(task, "goalId"));
    setNeed("guided_practice");
    setIntent("practice");
    setView("resource");
  }

  return (
    <div className="screen learn-screen premium-screen">
      <PageHeader
        title="Learn"
        context={view === "home" ? undefined : <span>{view === "resource" ? "Find a resource" : "Active lesson"}</span>}
        description={view === "home" ? "Continue from where you stopped, repair a weak area, or find a reviewed resource for a specific goal. Progress changes only after a check that can support it." : view === "resource" ? "Tell Continuum what you need. It will ask only the questions that change the recommendation." : "Work through the idea, then check it. Progress changes only after a check that can support it."}
        stats={view === "home" ? [{ label: "active paths", value: state.goals.length }, { label: "tracked concepts", value: state.learningStates.length }] : undefined}
      />

      {view === "home" ? <div className="learn-home">
        {/* Band 1 — one primary action. The other routes are secondary text links;
            a disabled control is hidden rather than shown greyed out. */}
        <section className="learn-home-hero">
          <Card className="continue-learning-card">
            <div className="learn-card-label"><Sparkles size={15} aria-hidden="true" />CONTINUE</div>
            <div className="continue-learning-body">
              <div>
                {/* One honest composite state. A "Mastered" badge must never sit
                    beside an open misconception on the same concept. */}
                <Badge tone={focusSignal.tone}>{focusSignal.label}</Badge>
                <h2>{focusSignal.title}</h2>
                <p>{focusSignal.body}</p>
              </div>
              <Tooltip label={`Exposure ${focusSignal.exposure}% · Transfer ${focusSignal.transfer}% · Retention ${focusSignal.retention}%`}>
                <div className="mastery-ring" style={{ "--mastery": `${focusSignal.composite}%` } as React.CSSProperties} tabIndex={0} role="img" aria-label={`${focusSignal.composite}% composite understanding. Exposure ${focusSignal.exposure}%, transfer ${focusSignal.transfer}%, retention ${focusSignal.retention}%.`}>
                  <strong>{focusSignal.composite}%</strong><span>understanding</span>
                </div>
              </Tooltip>
            </div>
            <div className="continue-learning-actions">
              <Button className="button-primary button-large" disabled={lessonBusy} onClick={() => void openLesson()}>{lessonBusy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <BookOpen size={16} aria-hidden="true" />}Open 6-min lesson</Button>
            </div>
            <div className="learn-secondary-actions">
              <button onClick={() => { setRecommendation(undefined); setActivity(undefined); setResumeActivityId(""); setResumeRequested(false); setGoalOverridden(false); setView("resource"); }}><Search size={14} aria-hidden="true" />Find a resource</button>
              <button onClick={() => void openLesson()} disabled={lessonBusy}><BrainCircuit size={14} aria-hidden="true" />Review weak areas</button>
              {recentActivityId ? <button onClick={() => { setRecommendation(undefined); setActivity(undefined); setResumeRequested(true); setView("resource"); }}><RotateCcw size={14} aria-hidden="true" />Return to active resource</button> : null}
              <button onClick={() => { setRecommendation(undefined); setActivity(undefined); setResumeActivityId(""); setResumeRequested(false); setGoalOverridden(false); setTopic("electric potential and potential energy"); setNeed("conceptual_intuition"); setIntent("concept"); setView("resource"); }}><ChevronRight size={14} aria-hidden="true" />Compare resources</button>
            </div>
          </Card>
        </section>

        {/* Band 2 — your paths. */}
        <section className="learning-home-section"><div className="section-heading"><div><h2>Continue from active goals</h2></div></div><div className="learning-path-grid">{state.goals.slice(0, 3).map((goal) => { const goalTasks = state.tasks.filter((task) => text(task, "goalId") === text(goal, "id") && text(task, "status") !== "done"); const next = goalTasks[0]; return <Card className="learning-path-card" key={text(goal, "id")}><span><GraduationCap size={18} aria-hidden="true" /></span><div><small>{formatLabel(text(goal, "status", "active"))} path</small><h3>{text(goal, "title")}</h3><p>{next ? text(next, "title") : "No unfinished learning task"}</p></div><button disabled={!next} onClick={() => next && continueTask(next)}>Continue <ChevronRight size={15} aria-hidden="true" /></button></Card>;})}{!state.goals.length ? <EmptyState title="No active path yet" body="Create a goal and Continuum will build a learning path from it." /> : null}</div></section>

        {/* Band 3 — tools, in tabs rather than stacked. The concept map is one of
            the strongest features here and was buried below the fold. */}
        <section className="learning-home-section learn-tools">
          <nav className="section-tabs" role="tablist" aria-label="Learning tools">
            {([
              { id: "map", label: "Concept map" },
              { id: "banks", label: "Question banks" },
              { id: "videos", label: "Videos" },
              { id: "activity", label: "Activity" },
            ] as const).map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={tool === entry.id} className={tool === entry.id ? "active" : ""} onClick={() => setTool(entry.id)}>{entry.label}</button>)}
          </nav>

          {tool === "map" ? <ConceptMap state={state} onOpenLesson={(node) => void openLesson(node)} onAskQuestion={(node) => askAsQuestion(node.description, node.id)} /> : null}
          {tool === "banks" ? <QuestionBankPanel state={state} showToast={showToast} onRefresh={onRefresh} /> : null}
          {tool === "videos" ? <Card className="learning-video-search"><form onSubmit={searchVideos}><label><Video size={17} aria-hidden="true" /><input value={videoQuery} onChange={(event) => setVideoQuery(event.target.value)} minLength={2} maxLength={300} aria-label="Video topic" /><Button className="button-primary" disabled={videoBusy}>{videoBusy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}{videoBusy ? "Searching…" : "Search videos"}</Button></label></form>{videos ? <><div className="video-provider-row"><span className={`provider-status ${videos.status}`}><i />YouTube: {videos.status}</span><small>{videos.note}</small></div>{videos.videos.length ? <div className="learning-video-grid">{videos.videos.map((video) => <article key={video.id}>{video.thumbnailUrl ? <span className="video-thumbnail" role="img" aria-label={`Thumbnail for ${video.title}`} style={{ backgroundImage: `url(${JSON.stringify(video.thumbnailUrl)})` }} /> : <span className="video-placeholder"><PlayCircle size={28} aria-hidden="true" /></span>}<div><Badge tone={video.reviewState === "trusted_channel" ? "green" : "neutral"}>{video.reviewState === "trusted_channel" ? "Trusted channel" : "Provider result"}</Badge><h3>{video.title}</h3><p>{video.channelTitle}</p><a href={video.watchUrl} target="_blank" rel="noreferrer">Watch on YouTube <ExternalLink size={13} aria-hidden="true" /></a></div></article>)}</div> : <div className="video-unconfigured"><Video size={21} aria-hidden="true" /><div><strong>{videos.status === "unconfigured" ? "YouTube API key not configured" : "No embeddable results returned"}</strong><p>{videos.message ?? "Review search results directly before choosing a video."}</p></div><a className="button button-secondary" href={videos.handoffUrl} target="_blank" rel="noreferrer">Open YouTube search <ExternalLink size={14} aria-hidden="true" /></a></div>}</> : <div className="video-search-empty"><PlayCircle size={23} aria-hidden="true" /><p>Search uses YouTube’s official API when configured. Results do not raise mastery until you return with evidence.</p></div>}</Card> : null}
          {tool === "activity" ? (state.resourceActivities.length ? <div className="recent-learning-strip">{state.resourceActivities.slice(0, 8).map((item) => <Card key={text(item, "id")}><span><CheckCircle2 size={16} aria-hidden="true" /></span><div><strong>{formatLabel(text(item, "status", "started"))}</strong><p>{text(item, "resourceId", "Guided resource activity")}</p></div><small>{item.startedAt ? new Date(String(item.startedAt)).toLocaleDateString() : ""}</small></Card>)}</div> : <EmptyState title="No learning activity yet" body="Opening a resource and returning with evidence records an activity here." action={<Button className="button-primary compact-button" onClick={() => { setRecommendation(undefined); setActivity(undefined); setView("resource"); }}>Find a resource</Button>} />) : null}
        </section>
      </div> : null}

      {view === "lesson" && lesson ? <Card className="native-lesson-screen">
        <header><button onClick={() => setView("home")}><ArrowLeft size={15} />Back to Learn</button><div><Badge tone={lesson.evidenceState === "direct_support" ? "green" : "neutral"}>{lesson.evidenceState === "direct_support" ? "Reviewed curriculum" : "Generated from your path"}</Badge><span><Clock3 size={13} />{lesson.durationMinutes ?? 6} minutes</span></div></header>
        <div className="lesson-title-block"><div className="learn-card-label"><BookOpen size={15} />TARGETED MICRO-LESSON</div><h2>{lesson.title}</h2><p>{lesson.explanation}</p></div>
        {lesson.objectives?.length ? <section className="lesson-objectives"><strong>By the end, you should be able to</strong><ul>{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></section> : null}
        <div className="lesson-contrast-grid">{(lesson.sections ?? []).map((section, index) => <section key={section.heading}><span>{index + 1}</span><h3>{section.heading}</h3><p>{section.body}</p><Button className="button-secondary" onClick={() => askAsQuestion(section.body, lesson.conceptId)}><HelpCircle size={14} />Ask as Question</Button></section>)}</div>
        {lesson.examples?.length ? <section className="lesson-examples"><strong>Example</strong>{lesson.examples.map((example) => <p key={example}>{example}</p>)}</section> : null}
        <div className="lesson-proof"><ShieldCheck size={18} /><div><strong>{lesson.evidenceState === "direct_support" ? "Source-locked lesson" : "Context-limited lesson"}</strong><p>{lesson.evidenceState === "direct_support" ? "Directly supported" : formatLabel(lesson.evidenceState)}{lesson.sourceChunkIds.length ? ` · ${lesson.sourceChunkIds.join(", ")}` : ""} · {lesson.model}</p></div></div>
        <div className="lesson-understanding"><h3>Check for understanding</h3><p>{lesson.checksForUnderstanding[0]}</p>{!lessonRead ? <div className="lesson-primary-check"><Button className="button-primary" disabled={lessonBusy} onClick={() => void markLessonRead()}><Check size={15} />I completed the lesson</Button><Button className="button-secondary" onClick={() => askAsQuestion(lesson.checksForUnderstanding[0] ?? lesson.explanation, lesson.conceptId)}><HelpCircle size={14} />Answer this question</Button></div> : lesson.conceptId.includes("potential") ? <div className="lesson-checkpoint"><label>Unseen check: using k = 9×10⁹, what is V at 0.75 m from a +2 nC point charge?<div><input value={checkpointAnswer} onChange={(event) => setCheckpointAnswer(event.target.value)} inputMode="decimal" placeholder="Answer in volts" /><Button className="button-primary" disabled={lessonBusy || !checkpointAnswer.trim()} onClick={() => void checkLesson()}>{lessonBusy ? "Checking…" : "Check answer"}</Button></div></label>{checkpoint ? <div className={checkpoint.correct ? "checkpoint-result success" : "checkpoint-result retry"}>{checkpoint.correct ? <CheckCircle2 size={19} /> : <RotateCcw size={19} />}<div><strong>{checkpoint.correct ? "Transfer checkpoint passed" : "Try the relationship again"}</strong><p>{checkpoint.explanation}</p></div></div> : null}</div> : <div className="lesson-generic-check"><CheckCircle2 size={18} /><div><strong>Lesson progress saved</strong><p>Now answer in your own words. Reading alone does not increase transfer mastery.</p></div><Button className="button-primary" onClick={() => askAsQuestion(lesson.checksForUnderstanding[0] ?? lesson.explanation, lesson.conceptId)}>Answer now<ArrowRight size={14} /></Button></div>}</div>
      </Card> : null}

      {view === "resource" || recommendation ? <div className="handoff-steps" aria-label="Resource workflow"><span className={!recommendation ? "active" : "done"}><i>1</i>Define the need</span><span className={recommendation && !activity ? "active" : activity ? "done" : ""}><i>2</i>Choose and start</span><span className={activity?.status === "started" ? "active" : activity?.returnedAt ? "done" : ""}><i>3</i>Return with evidence</span><span className={["returned", "needs_review"].includes(activity?.status ?? "") ? "active" : activity?.status === "verified" ? "done" : ""}><i>4</i>Verify progress</span></div> : null}

      {!recommendation && view === "resource" ? <Card className="resource-search-card progressive-resource-form">
        <div className="resource-search-heading">
          <button onClick={() => setView("home")}><ArrowLeft size={14} />Back to Learn</button>
          <div><p className="eyebrow">FIND A RESOURCE</p><h2>What are you trying to learn or finish?</h2><p>Write it naturally. Continuum infers the subject and connects the closest active goal.</p></div>
        </div>
        <label className="resource-primary-prompt">
          <span className="sr-only">What are you trying to learn or finish?</span>
          <textarea autoFocus value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={500} placeholder="For example: understand electric potential, finish my SAT practice test, or debug my Python assignment…" />
        </label>
        <fieldset className="learning-intent-options">
          <legend>What kind of help would move this forward?</legend>
          <div>{intentions.map(([id, value, label, description]) => <button key={id} type="button" className={intent === id ? "active" : ""} aria-pressed={intent === id} onClick={() => { setIntent(id); setNeed(value); }}><strong>{label}</strong><small>{description}</small></button>)}</div>
        </fieldset>
        {need ? <div className="resource-followups">
          <fieldset><legend>How much time do you have?</legend><div className="choice-chips">{[[15, "15 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"], [120, "Longer"]].map(([value, label]) => <button key={value} type="button" className={minutes === value ? "active" : ""} aria-pressed={minutes === value} onClick={() => setMinutes(Number(value))}>{label}</button>)}</div></fieldset>
          <fieldset><legend>What can you access?</legend><div className="choice-chips"><button type="button" className={cost === "free_only" ? "active" : ""} aria-pressed={cost === "free_only"} onClick={() => setCost("free_only")}>Free</button><button type="button" className={cost === "any" ? "active" : ""} aria-pressed={cost === "any"} onClick={() => setCost("any")}>Paid resources are okay</button></div></fieldset>
          <details className="inferred-goal">
            <summary><span><Target size={15} />Connected goal</span><strong>{text(state.goals.find((goal) => text(goal, "id") === goalId), "title", "No linked goal")}</strong><small>Change</small></summary>
            <label>Use this goal<select value={goalId} onChange={(event) => { setGoalId(event.target.value); setGoalOverridden(true); }}><option value="">No linked goal</option>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</select></label>
          </details>
        </div> : null}
        <div className="resource-search-actions"><p><ShieldCheck size={15} />You will always see what to do and how progress can be checked before you start.</p><LoadingButton className="button-primary button-large" loading={busy} loadingLabel="Finding the best match…" disabled={topic.trim().length < 2 || !need} onClick={() => void query()}><Search size={16} />Find my best match</LoadingButton></div>
        {resumeBusy ? <p className="subtle-meta">Restoring your active resource…</p> : null}
      </Card> : null}

      {recommendation ? <Card className="resource-result-card">
        <div className="resource-workflow-controls"><button onClick={() => setView("home")}><ArrowLeft size={14} />Back to Learn</button><Button className="button-secondary" onClick={requestGoalChange}><Target size={14} />Change learning goal</Button></div>
        {changedPreference ? <div className="preference-change"><Check size={15} /><span><strong>Preference updated:</strong> {changedPreference}</span></div> : null}
        <header className="resource-result-summary">
          <div><p className="eyebrow">YOUR BEST MATCH</p><h2>{recommendation.selected.title}</h2><p>{recommendation.selected.description}</p></div>
          <div className="resource-quality"><strong>{Math.round(recommendation.selected.qualityScore * 100)}/100</strong><span>Review quality</span><small>{formatLabel(recommendation.selected.authority)}</small></div>
        </header>
        <section className="resource-match-reason"><h3>Why this is the best match</h3><p><strong>For “{topic || recommendation.selected.topicTags.slice(0, 3).join(" · ")}”:</strong> {recommendation.whyBetterThanNative}</p></section>
        <div className="resource-stats"><span><Clock3 size={15} /><strong>{recommendation.selected.estimatedMinutes} min</strong> duration</span><span><Target size={15} /><strong>{formatLabel(recommendation.selected.cost)}</strong> access</span><span><ShieldCheck size={15} /><strong>{recommendation.selected.provider}</strong> provider</span></div>
        <section className="resource-exact-action"><span>1</span><div><h3>Exact action to take</h3><p>{recommendation.selected.exactLocator.section ?? recommendation.selected.exactLocator.activity ?? recommendation.selected.exactLocator.exercise ?? "Open the linked activity"}</p></div></section>
        <div className="resource-focus-grid">
          <section><span>2</span><div><h3>What to focus on</h3><ul>{recommendation.selected.focusInstructions.map((item) => <li key={item}>{item}</li>)}</ul></div></section>
          <section><span>3</span><div><h3>What to return with</h3><ul>{recommendation.selected.completionInstructions.map((item) => <li key={item}>{item}</li>)}</ul><p><strong>Progress check:</strong> {recommendation.verificationPlan}</p></div></section>
        </div>

        {!activity ? <div className="resource-actions"><LoadingButton className="button-primary button-large" loading={busy} loadingLabel="Starting resource…" onClick={() => void start()}>{recommendation.selected.native ? <BookOpen size={16} /> : <ExternalLink size={16} />}Start resource</LoadingButton><Button className="button-secondary button-large" onClick={() => setRejectionOpen(true)}><RotateCcw size={15} />Find a different resource</Button><small>Starting saves the activity and its progress check. It does not mark the work complete.</small></div> : null}

        {activity?.status === "started" && recommendation.selected.native && recommendation.selected.nativeContent ? <div className="native-lesson">{recommendation.selected.nativeContent.map((block) => <section key={block.heading}><h3>{block.heading}</h3><p>{block.body}</p></section>)}</div> : null}
        {activity?.status === "started" ? <div className="return-panel"><div><Badge tone="orange">In progress</Badge><h3>{recommendation.selected.native ? "Finish the lesson, then return" : "Your place is saved"}</h3><p>{recommendation.selected.native ? "Complete the content above." : "Open the resource in a new tab. This page will keep your return point."}</p>{!recommendation.selected.native ? <a className="button button-primary button-large" href={recommendation.selected.url} target="_blank" rel="noopener noreferrer">Open resource<ExternalLink size={16} /></a> : null}</div><label>Notes from the activity (optional)<textarea value={returnEvidence} onChange={(event) => setReturnEvidence(event.target.value)} placeholder="Exercise, score, observation, link, or what you completed" /></label><LoadingButton className="button-secondary" loading={busy} loadingLabel="Recording return…" onClick={() => void returned()}>I’m back — continue<ArrowRight size={15} /></LoadingButton></div> : null}

        {result?.outcome === "verified" ? <section id="verification-result" className="learning-completion">
          <SuccessState title="Progress verified" body={result.explanation} />
          <div className="completion-summary"><div><span>Completed</span><strong>{recommendation.selected.title}</strong></div><div><span>Learning change</span><strong>{result.masteryBefore && result.mastery ? `${Math.round(number(result.masteryBefore, "understanding", 0) * 100)}% → ${Math.round(number(result.mastery, "understanding", 0) * 100)}% understanding` : "Related goal and mastery updated"}</strong></div><div><span>Recommended next step</span><strong>{result.scheduleUpdate?.status === "scheduled" ? "A 15-minute spaced review is scheduled for tomorrow." : "Continue from your updated Learn page."}</strong></div></div>
          <div className="completion-actions"><Button className="button-primary button-large" onClick={() => void continueLearning()}>Continue learning<ArrowRight size={16} /></Button><Button className="button-secondary" onClick={() => setShowResultReview((value) => !value)}>Review this result</Button></div>
          {showResultReview ? <div className="result-review-details"><p><strong>Verification:</strong> {recommendation.verificationPlan}</p><p><strong>Connected goal:</strong> {text(state.goals.find((goal) => text(goal, "id") === goalId), "title", "No linked goal")}</p><p><strong>Saved evidence:</strong> {activity?.evidenceIds.length ?? 0} evidence record{activity?.evidenceIds.length === 1 ? "" : "s"}</p></div> : null}
        </section> : null}

        {activity && ["returned", "needs_review"].includes(activity.status) && result?.outcome !== "verified" ? <div className="verification-panel"><div><Badge tone="blue">Check progress now</Badge><h3>Show what you completed</h3><p>{recommendation.selected.verification.prompt}</p></div>{result?.outcome === "recorded" ? <SuccessState title="Evidence recorded" body={result.explanation} /> : result?.outcome === "not_sufficient" ? <ErrorState title="This does not show completion yet" body={result.explanation} /> : null}<label>{recommendation.selected.verification.kind === "score_import" ? "Required score details" : recommendation.selected.verification.kind === "artifact" ? "Artifact or test-output reference" : "Your answer"}<input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={recommendation.selected.id === "resource_bluebook_sat" ? "Test 10 · Reading and Writing 760 · Math 760" : "Enter the requested evidence"} /></label><LoadingButton className="button-primary" loading={busy} loadingLabel="Checking progress…" disabled={!answer.trim()} onClick={() => void verify()}><ShieldCheck size={16} />Check progress</LoadingButton></div> : null}

        {recommendation.alternatives.length ? <details className="resource-alternatives"><summary>See why other options ranked lower</summary>{recommendation.alternatives.map((alternative) => <div key={alternative.resource.id}><strong>{alternative.resource.title}</strong><span>{alternative.whyNotSelected}</span></div>)}</details> : null}
      </Card> : null}

      <Modal open={rejectionOpen} onOpenChange={setRejectionOpen} title="Why isn’t this a good fit?" description="Your learning goal stays the same. Continuum will change the next ranking using this feedback." dirty={Boolean(rejectionReason || rejectionNote)} dirtyMessage="Discard this resource feedback?">
        <div className="resource-rejection-form">
          <div className="rejection-choices">{rejectionOptions.map(([value, label]) => <button key={value} type="button" className={rejectionReason === value ? "active" : ""} aria-pressed={rejectionReason === value} onClick={() => setRejectionReason(value)}>{label}</button>)}</div>
          {rejectionReason === "different_format" ? <fieldset><legend>Which format would work better?</legend><div className="choice-chips">{["video", "textbook", "interactive_simulation", "practice"].map((format) => <button key={format} type="button" className={preferredFormat === format ? "active" : ""} onClick={() => setPreferredFormat(format)}>{formatLabel(format)}</button>)}</div></fieldset> : null}
          <label>Anything else? <span>Optional</span><textarea value={rejectionNote} onChange={(event) => setRejectionNote(event.target.value)} placeholder="For example: I need something I can use offline." /></label>
          <div className="modal-inline-actions"><Button className="button-secondary" onClick={() => setRejectionOpen(false)}>Cancel</Button><LoadingButton className="button-primary" loading={busy} loadingLabel="Finding another match…" disabled={!rejectionReason || (rejectionReason === "different_format" && !preferredFormat)} onClick={() => void findDifferentResource()}>Find another match</LoadingButton></div>
        </div>
      </Modal>
      <ConfirmationDialog open={confirmGoalChange} onOpenChange={setConfirmGoalChange} title="Change learning goal?" description="This resets the current recommendation, return notes, and unsaved verification answer. Saved activity history remains in Continuum." confirmLabel="Change learning goal" onConfirm={() => { setConfirmGoalChange(false); changeLearningGoal(); }} />
      <AskQuestionDialog selection={askSelection} conceptId={askConceptId} open={askOpen} onOpenChange={setAskOpen} onRefresh={onRefresh} />
    </div>
  );
}
