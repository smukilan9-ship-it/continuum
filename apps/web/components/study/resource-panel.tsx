"use client";

/**
 * Finding material (redesign.md §14.1, replaces C16).
 *
 * What this replaces: a four-step stepper on its own page — define the need,
 * choose and start, return with evidence, verify — where step 1 was a free-text
 * box plus six intent cards plus time plus cost plus a goal picker, and steps
 * 2-4 were separate screens showing one recommendation at a time behind a
 * "Find a different resource" modal.
 *
 * What it is now: a right panel asking **one** question, with everything that
 * rarely changes behind an Options disclosure, results ranked inline, and the
 * four workflow steps collapsed into the states of a single card.
 */
import type { ResourceActivity, ResourceRecommendation } from "@continuum/schemas";
import { ArrowRight, Check, Clock3, ExternalLink, PlayCircle, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  DataRegion,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingButton,
  LoadingState,
  Menu,
  SidePanel,
  StatusChip,
  type RegionStatus,
} from "@/components/ui";
import { formatLabel } from "@/lib/labels";
import { text, type Row } from "@/components/workspace/types";

type Toast = (message: string | null) => void;

/** The one question. `need` is the API's vocabulary; the chip is the learner's. */
const NEEDS = [
  { id: "conceptual_intuition", label: "Understand it" },
  { id: "guided_practice", label: "Practise" },
  { id: "diagnosis", label: "Fix a weak area" },
  { id: "official_exam_simulation", label: "Prep for a test" },
  { id: "source_exploration", label: "Finish an assignment" },
  { id: "canonical_explanation", label: "Just find something" },
] as const;

const REJECTIONS = [
  ["too_long", "Too long"],
  ["too_easy", "Too easy"],
  ["too_difficult", "Too difficult"],
  ["already_used", "I already used it"],
  ["different_format", "I want a different format"],
  ["cannot_access", "I cannot access it"],
  ["not_relevant", "Not relevant enough"],
] as const;

type Ranked = { resource: ResourceRecommendation["selected"]; why: string; rank: number };

/** `selected` plus `alternatives` is already a ranking; it was only ever shown one at a time. */
function ranked(recommendation: ResourceRecommendation): Ranked[] {
  return [
    { resource: recommendation.selected, why: recommendation.whyBetterThanNative, rank: 0 },
    ...recommendation.alternatives.map((alternative, index) => ({ resource: alternative.resource, why: alternative.whyNotSelected, rank: index + 1 })),
  ];
}

export function ResourcePanel({
  open,
  onOpenChange,
  goal,
  conceptTitle,
  defaultNeed = "conceptual_intuition",
  showToast,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Inferred from context — §14.1 removes the goal picker outright. */
  goal?: Row;
  conceptTitle?: string;
  /**
   * Which chip is answered for you on open, inferred from the weakest mastery
   * dimension. The question is still asked and still changeable; answering it
   * on the learner's behalf is what keeps finding *and starting* material to
   * two clicks from the goal (AC-LN4) instead of three.
   */
  defaultNeed?: string;
  showToast: Toast;
  onRefresh: () => Promise<void>;
}) {
  const [need, setNeed] = useState<string>("");
  const [minutes, setMinutes] = useState(45);
  const [cost, setCost] = useState("free_only");
  const [status, setStatus] = useState<RegionStatus>("idle");
  const [error, setError] = useState("");
  const [recommendation, setRecommendation] = useState<ResourceRecommendation>();
  /**
   * Video results, from `/api/learning/videos`.
   *
   * That endpoint was complete — rate limited, BYOK key handling, a
   * trusted-channel allowlist, and an explicit note that provider results are
   * not curriculum claims — and nothing in the product called it. A capability
   * with no surface is the same defect as a control with no capability, just
   * harder to notice.
   */
  const [videos, setVideos] = useState<Array<Record<string, unknown>>>([]);
  const [videoState, setVideoState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [videoNote, setVideoNote] = useState("");
  const [activity, setActivity] = useState<ResourceActivity>();

  /**
   * Runs beside the ranked list rather than instead of it. A video is a
   * different kind of answer from a reviewed explanation, and the learner is
   * better placed than a ranker to know which one they want right now.
   */
  const findVideos = useCallback(async (topic: string) => {
    if (!topic.trim()) return;
    setVideoState("loading");
    try {
      const response = await fetch(`/api/learning/videos?q=${encodeURIComponent(topic.slice(0, 300))}`, { cache: "no-store" });
      const payload = await response.json() as { videos?: Array<Record<string, unknown>>; note?: string; handoffUrl?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Video search is unavailable.");
      setVideos(payload.videos ?? []);
      setVideoNote(payload.note ?? "");
      setVideoState("ready");
    } catch (cause) {
      setVideoState("error");
      setVideoNote(cause instanceof Error ? cause.message : "Video search is unavailable.");
    }
  }, []);
  const [startedId, setStartedId] = useState("");
  const [evidence, setEvidence] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<{ ok: boolean; explanation: string }>();
  const [excluded, setExcluded] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);

  const topic = conceptTitle || text(goal, "title") || "my current goal";

  // Rank on open so the panel arrives with answers rather than with a form.
  useEffect(() => {
    if (!open || need) return;
    setNeed(defaultNeed);
    void search(excluded, reasons, minutes, defaultNeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function requestArgs(nextExcluded = excluded, nextReasons = reasons, nextMinutes = minutes, nextNeed = need) {
    const goalId = text(goal, "id");
    return {
      topic,
      need: nextNeed || defaultNeed,
      costPreference: cost,
      minutesAvailable: nextMinutes,
      ...(nextExcluded.length ? { excludeResourceIds: nextExcluded } : {}),
      ...(nextReasons.length ? { rejectionReasons: nextReasons } : {}),
      ...(goalId ? { goalId } : {}),
    };
  }

  async function search(nextExcluded = excluded, nextReasons = reasons, nextMinutes = minutes, nextNeed = need) {
    setStatus("loading");
    setError("");
    setActivity(undefined);
    setStartedId("");
    setVerified(undefined);
    try {
      const params = new URLSearchParams(
        Object.entries(requestArgs(nextExcluded, nextReasons, nextMinutes, nextNeed))
          .map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : String(value)]),
      );
      const response = await fetch(`/api/resources?${params}`, { cache: "no-store" });
      const body = await response.json() as { recommendation?: ResourceRecommendation; error?: string };
      if (!response.ok || !body.recommendation) throw new Error(body.error ?? "No reviewed resource matched this need");
      setRecommendation(body.recommendation);
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No reviewed resource matched this need");
      setStatus("error");
    }
  }

  async function start(resourceId: string) {
    if (!recommendation) return;
    setBusy(true);
    try {
      const response = await fetch("/api/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", ...requestArgs(), ...(resourceId === recommendation.selected.id ? {} : { excludeResourceIds: [...excluded, recommendation.selected.id] }) }),
      });
      const body = await response.json() as { activity?: ResourceActivity; recommendation?: ResourceRecommendation; error?: string };
      if (!response.ok || !body.activity || !body.recommendation) throw new Error(body.error ?? "This could not be started");
      setActivity(body.activity);
      setRecommendation(body.recommendation);
      setStartedId(body.recommendation.selected.id);
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "This could not be started"); }
    finally { setBusy(false); }
  }

  async function returned() {
    if (!activity) return;
    setBusy(true);
    try {
      const response = await fetch("/api/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "return", activityId: activity.id, evidence: evidence || undefined }),
      });
      const body = await response.json() as { activity?: ResourceActivity; error?: string };
      if (!response.ok || !body.activity) throw new Error(body.error ?? "The return could not be recorded");
      setActivity(body.activity);
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "The return could not be recorded"); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (!activity || !recommendation) return;
    setBusy(true);
    try {
      const contract = recommendation.selected.verification;
      const response = await fetch("/api/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify", activityId: activity.id, answer, ...(contract.kind === "artifact" ? { artifactReference: answer } : {}) }),
      });
      const body = await response.json() as { activity?: ResourceActivity; verified?: boolean; explanation?: string; error?: string };
      if (!response.ok || !body.activity) throw new Error(body.error ?? "This could not be checked");
      setActivity(body.activity);
      setVerified({ ok: Boolean(body.verified), explanation: body.explanation ?? "" });
      await onRefresh();
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "This could not be checked"); }
    finally { setBusy(false); }
  }

  /** Rejecting re-ranks immediately — it never blocks on a modal (§14.1). */
  async function reject(resourceId: string, reason: string) {
    const nextExcluded = [...new Set([...excluded, resourceId])];
    const nextReasons = [...reasons, reason];
    const nextMinutes = reason === "too_long" ? Math.max(15, minutes - 15) : minutes;
    setExcluded(nextExcluded);
    setReasons(nextReasons);
    if (reason === "too_long") setMinutes(nextMinutes);
    if (reason === "cannot_access") setCost("free_only");
    await search(nextExcluded, nextReasons, nextMinutes);
  }

  const started = recommendation && startedId ? ranked(recommendation).find((entry) => entry.resource.id === startedId) : undefined;

  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title="Find material" width={480}>
      <div className="study-panel">
        <fieldset className="study-chip-set">
          <legend>What do you need?</legend>
          <div>
            {NEEDS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={need === entry.id ? "study-chip study-chip-on" : "study-chip"}
                aria-pressed={need === entry.id}
                onClick={() => { setNeed(entry.id); void search(excluded, reasons, minutes, entry.id); }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Time and cost have sensible defaults and rarely change, so they are
            one disclosure rather than two more required steps. */}
        <details className="study-options">
          <summary>Options<span>{minutes} minutes · {cost === "free_only" ? "free" : "paid is fine"}</span></summary>
          <div className="study-options-body">
            <Field label="How long do you have?">
              {({ id }) => (
                <div className="study-chip-row" id={id}>
                  {[15, 30, 45, 60, 120].map((value) => (
                    <button key={value} type="button" className={minutes === value ? "study-chip study-chip-on" : "study-chip"} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>
                      {value === 120 ? "Longer" : `${value} min`}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label="What can you access?">
              {({ id }) => (
                <div className="study-chip-row" id={id}>
                  <button type="button" className={cost === "free_only" ? "study-chip study-chip-on" : "study-chip"} aria-pressed={cost === "free_only"} onClick={() => setCost("free_only")}>Free only</button>
                  <button type="button" className={cost === "any" ? "study-chip study-chip-on" : "study-chip"} aria-pressed={cost === "any"} onClick={() => setCost("any")}>Paid is fine</button>
                </div>
              )}
            </Field>
            {need ? <Button variant="secondary" size="sm" onClick={() => void search()}><Search size={14} aria-hidden="true" />Search again</Button> : null}
          </div>
        </details>

        <DataRegion
          status={status}
          idle={<EmptyState title="Pick what you need" body={`Continuum will rank reviewed material for ${topic}.`} />}
          loading={<LoadingState label="Ranking material for you" rows={3} />}
          error={<ErrorState title="Nothing matched that" body={error} action={<Button variant="secondary" size="sm" onClick={() => void search()}>Try again</Button>} />}
        >
          {started ? (
            /* One card, four states: started → returned → checked. The stepper
               is gone; the same information now lives in the card it is about. */
            <article className="study-active-card">
              <header>
                <StatusChip tone={verified?.ok ? "success" : activity?.returnedAt ? "info" : "processing"} label={verified?.ok ? "Verified" : activity?.returnedAt ? "Checking" : "In progress"} />
                <h3>{started.resource.title}</h3>
              </header>
              <dl className="study-active-steps">
                <div><dt>Do this</dt><dd>{started.resource.exactLocator.section ?? started.resource.exactLocator.activity ?? started.resource.exactLocator.exercise ?? "Open the linked activity"}</dd></div>
                <div><dt>Focus on</dt><dd>{started.resource.focusInstructions.join("; ")}</dd></div>
                <div><dt>Come back with</dt><dd>{started.resource.completionInstructions.join("; ")}</dd></div>
              </dl>

              {!activity?.returnedAt ? (
                <div className="study-active-actions">
                  {started.resource.native ? null : (
                    <a className="button button-primary" href={started.resource.url} target="_blank" rel="noopener noreferrer">
                      Open resource<ExternalLink size={15} aria-hidden="true" />
                    </a>
                  )}
                  <Field label="Notes from the activity (optional)">
                    {({ id }) => <Input id={id} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Exercise, score, or what you completed" />}
                  </Field>
                  <LoadingButton variant="secondary" loading={busy} loadingLabel="Recording…" onClick={() => void returned()}>I&rsquo;m back<ArrowRight size={15} aria-hidden="true" /></LoadingButton>
                </div>
              ) : verified?.ok ? (
                <p className="study-active-note"><Check size={15} aria-hidden="true" />{verified.explanation || "Progress verified and saved to your learning history."}</p>
              ) : (
                <div className="study-active-actions">
                  {verified && !verified.ok ? <ErrorState title="This does not show completion yet" body={verified.explanation} /> : null}
                  <Field label={recommendation!.selected.verification.prompt}>
                    {({ id }) => <Input id={id} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Enter what the resource produced" />}
                  </Field>
                  <LoadingButton variant="primary" loading={busy} loadingLabel="Checking…" disabled={!answer.trim()} onClick={() => void verify()}>
                    <ShieldCheck size={15} aria-hidden="true" />Check progress
                  </LoadingButton>
                </div>
              )}
            </article>
          ) : (
            /* Every candidate at once, ranked, with its reason. */
            <ol className="study-result-list">
              {recommendation ? ranked(recommendation).map((entry) => (
                <li key={entry.resource.id}>
                  <div className="study-result-copy">
                    <strong>{entry.resource.title}</strong>
                    <small>{entry.resource.provider} · <Clock3 size={11} aria-hidden="true" />{entry.resource.estimatedMinutes} min · {formatLabel(entry.resource.cost)}</small>
                    <p>{entry.why}</p>
                  </div>
                  <div className="study-result-actions">
                    <Button variant={entry.rank === 0 ? "primary" : "secondary"} size="sm" disabled={busy} onClick={() => void start(entry.resource.id)}>Start</Button>
                    <Menu
                      label={`Other options for ${entry.resource.title}`}
                      trigger={<button type="button" className="study-more" aria-label={`Not useful: ${entry.resource.title}`}>&#8943;</button>}
                      items={REJECTIONS.map(([value, label]) => ({ label: `Not useful — ${label.toLowerCase()}`, onSelect: () => void reject(entry.resource.id, value) }))}
                    />
                  </div>
                </li>
              )) : null}
              {recommendation && excluded.length ? (
                <li className="study-result-note">
                  <RotateCcw size={13} aria-hidden="true" />
                  <span>Re-ranked after {excluded.length} rejection{excluded.length === 1 ? "" : "s"}.</span>
                </li>
              ) : null}
            </ol>
          )}

          {/* Video, offered separately and labelled honestly. The endpoint's own
              note is shown rather than paraphrased: these are provider search
              results, not vetted curriculum, and the learner should know that
              before they spend twenty minutes on one. */}
          {recommendation ? (
            <section className="study-videos" aria-labelledby="study-videos-heading">
              <header>
                <h3 id="study-videos-heading"><PlayCircle size={15} aria-hidden="true" />Video</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={videoState === "loading"}
                  onClick={() => void findVideos(conceptTitle ?? text(goal, "title"))}
                >
                  {videoState === "loading" ? "Searching…" : videos.length ? "Search again" : "Find a video"}
                </Button>
              </header>

              {videoState === "error" ? <p className="form-error">{videoNote}</p> : null}

              {videoState === "ready" && !videos.length ? (
                <p className="study-videos-note">No video matched that closely enough to suggest.</p>
              ) : null}

              {videos.length ? (
                <>
                  <ul className="study-video-list">
                    {videos.slice(0, 4).map((video) => {
                      const id = String(video.id ?? video.videoId ?? "");
                      const url = String(video.url ?? `https://www.youtube.com/watch?v=${id}`);
                      return (
                        <li key={id || url}>
                          <a href={url} target="_blank" rel="noreferrer">
                            <strong>{String(video.title ?? "Untitled")}</strong>
                            <small>
                              {String(video.channelTitle ?? video.channel ?? "Unknown channel")}
                              {video.trusted ? <span className="study-video-trusted"><ShieldCheck size={11} aria-hidden="true" />Allowlisted</span> : null}
                            </small>
                          </a>
                          <ExternalLink size={14} aria-hidden="true" />
                        </li>
                      );
                    })}
                  </ul>
                  {videoNote ? <p className="study-videos-note">{videoNote}</p> : null}
                </>
              ) : null}
            </section>
          ) : null}
        </DataRegion>
      </div>
    </SidePanel>
  );
}
