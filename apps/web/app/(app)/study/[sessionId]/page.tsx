import { notFound, redirect } from "next/navigation";
import { StudySessionScreen } from "@/components/study/study-session-screen";
import { getStudySession } from "@/app/api/learning/sessions";
import { getServerUser } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { conceptLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { robots: { index: false, follow: false } };

type Row = Record<string, unknown>;

const string = (row: Row | undefined, key: string, fallback = "") => typeof row?.[key] === "string" ? row[key] as string : fallback;

/**
 * The stored item minus its answer key. The row carries `correctAnswer` and a
 * worked `explanation` so grading can stay on the server; neither is allowed
 * into the page the learner is about to answer on.
 */
function resumableCheckpoint(checkpoint: Row | undefined) {
  if (!checkpoint || typeof checkpoint.prompt !== "string" || typeof checkpoint.id !== "string") return undefined;
  return {
    id: checkpoint.id,
    prompt: checkpoint.prompt,
    answerType: (["number", "single_choice", "short_text"] as const).find((type) => type === checkpoint.answerType) ?? "short_text",
    choices: Array.isArray(checkpoint.choices) ? checkpoint.choices.filter((choice): choice is string => typeof choice === "string") : undefined,
    origin: typeof checkpoint.origin === "string" ? checkpoint.origin : "open_response",
  };
}

/**
 * The focused study route (§14.1). Deliberately *not* a `WorkspacePage`: this
 * surface has no sidebar and no view switching, which is the whole point of it.
 *
 * The concept's label and description are resolved here rather than on the
 * client so the first paint already names what is being studied — the session
 * row carries only its id.
 */
export default async function StudySessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await getServerUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/study/${sessionId}`)}`);

  const session = await getStudySession(sessionId, user.id);
  if (!session) notFound();

  const snapshot = await getStore(user.id).workspace("learn") as { learningStates?: Row[]; goals?: Row[] };
  const learningStates = Array.isArray(snapshot.learningStates) ? snapshot.learningStates : [];
  const goals = Array.isArray(snapshot.goals) ? snapshot.goals : [];
  const conceptId = session.conceptId ?? "concept_potential";
  const concept = learningStates.find((row) => string(row, "conceptId") === conceptId);
  const goal = goals.find((row) => string(row, "id") === session.goalId);

  return (
    <StudySessionScreen
      sessionId={session.id}
      conceptId={conceptId}
      conceptTitle={string(concept, "conceptLabel") || conceptLabel(conceptId)}
      conceptDescription={string(concept, "explanation", "the core idea behind this concept")}
      goalId={session.goalId}
      goalTitle={string(goal, "title", "Study")}
      initialPhase={session.phase}
      initialLesson={session.lesson as never}
      initialCheckpoint={resumableCheckpoint(session.checkpoint)}
    />
  );
}
