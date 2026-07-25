import { NeonRepository } from "@continuum/db";
import type { RouteDecision } from "@continuum/schemas";

function configuredDailyCap() {
  const value = Number(process.env.PER_USER_DAILY_TOKEN_CAP ?? 50_000);
  return Number.isFinite(value) ? Math.max(1_000, Math.min(10_000_000, Math.floor(value))) : 50_000;
}

export function dayBounds(now = new Date()) {
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
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

export async function checkSharedAiBudget(requestedTokens: number, now = new Date()) {
  const dailyTokenCap = boundedNumber(process.env.AI_GLOBAL_DAILY_TOKEN_CAP, 350_000, 10_000, 100_000_000);
  const monthlyBudgetUsd = boundedNumber(process.env.AI_SHARED_MONTHLY_BUDGET_USD, 25, 1, 10_000);
  if (!process.env.DATABASE_URL) return { dailyTokens: 0, dailyTokenCap, monthlyCostUsd: 0, monthlyBudgetUsd, nearLimit: false };
  const repo = new NeonRepository();
  const [daily, monthly] = await Promise.all([
    repo.getGlobalModelUsage(dayBounds(now).start, dayBounds(now).end),
    repo.getGlobalModelUsage(monthBounds(now).start, monthBounds(now).end),
  ]);
  if (daily.tokens + requestedTokens > dailyTokenCap || monthly.estimatedCostUsd >= monthlyBudgetUsd) {
    throw new Error("Shared AI allowance reached");
  }
  return {
    dailyTokens: daily.tokens,
    dailyTokenCap,
    monthlyCostUsd: monthly.estimatedCostUsd,
    monthlyBudgetUsd,
    nearLimit: daily.tokens + requestedTokens > dailyTokenCap * 0.8 || monthly.estimatedCostUsd > monthlyBudgetUsd * 0.8,
  };
}

export function estimateModelCost(decision: RouteDecision, usage?: unknown) {
  const tokenUsage = usage as { inputTokens?: number; outputTokens?: number } | undefined;
  const inputTokens = Math.max(0, Number(tokenUsage?.inputTokens ?? 0));
  const outputTokens = Math.max(0, Number(tokenUsage?.outputTokens ?? 0));
  const rates = decision.costClass === "high"
    ? { input: 1.2, output: 2.4 }
    : decision.costClass === "medium"
      ? { input: 0.45, output: 0.9 }
      : { input: 0.08, output: 0.16 };
  return Number((((inputTokens * rates.input) + (outputTokens * rates.output)) / 1_000_000).toFixed(8));
}

export async function logModelUsage(input: { userId: string; feature: string; decision: RouteDecision; usage?: unknown; occurredAt?: string }) {
  if (!process.env.DATABASE_URL) return;
  const usage = input.usage as { inputTokens?: number; outputTokens?: number } | undefined;
  await new NeonRepository().logModelRoute({
    id: input.decision.id,
    userId: input.userId,
    feature: input.feature,
    taskClass: input.decision.taskClass,
    provider: input.decision.route,
    model: input.decision.model,
    reason: userFacingReason(input.decision),
    verificationStatus: input.decision.verification,
    fallbackUsed: input.decision.fallbackUsed,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    costClass: input.decision.costClass,
    estimatedCostUsd: estimateModelCost(input.decision, usage),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
}
