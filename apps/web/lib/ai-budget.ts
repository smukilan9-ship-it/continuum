import { NeonRepository } from "@continuum/db";
import type { RouteDecision } from "@continuum/schemas";

function configuredDailyCap() {
  const value = Number(process.env.PER_USER_DAILY_TOKEN_CAP ?? 50_000);
  return Number.isFinite(value) ? Math.max(1_000, Math.min(10_000_000, Math.floor(value))) : 50_000;
}

function dayBounds(now = new Date()) {
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

function userFacingReason(decision: RouteDecision) {
  if (decision.fallbackUsed) return "The first qualified cloud route was unavailable, so Continuum used the next route that met the same task requirements.";
  if (decision.taskClass === "citation_entailment") return "Evidence-critical work received a deeper reasoning and verification pass.";
  if (decision.taskClass === "code_reasoning") return "The coding request needed a route optimized for program analysis and teaching.";
  if (["classification", "extraction", "summarization", "misconception_diagnosis"].includes(decision.taskClass)) return "A fast structured route was sufficient for this bounded task.";
  return "Selected by task capability, context requirements, reliability, and cost policy.";
}

export async function checkDailyAiBudget(userId: string, requestedTokens: number) {
  const cap = configuredDailyCap();
  if (!process.env.DATABASE_URL) return { used: 0, cap, remaining: cap };
  const bounds = dayBounds();
  const used = await new NeonRepository().getDailyModelUsage(userId, bounds.start, bounds.end);
  if (used + Math.max(1, requestedTokens) > cap) throw new Error("Daily AI token cap exceeded");
  return { used, cap, remaining: Math.max(0, cap - used - requestedTokens) };
}

export async function logModelUsage(input: { userId: string; decision: RouteDecision; usage?: unknown; occurredAt?: string }) {
  if (!process.env.DATABASE_URL) return;
  const usage = input.usage as { inputTokens?: number; outputTokens?: number } | undefined;
  await new NeonRepository().logModelRoute({
    id: input.decision.id,
    userId: input.userId,
    taskClass: input.decision.taskClass,
    provider: input.decision.route,
    model: input.decision.model,
    reason: userFacingReason(input.decision),
    verificationStatus: input.decision.verification,
    fallbackUsed: input.decision.fallbackUsed,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    costClass: input.decision.costClass,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
}
