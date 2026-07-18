import type { z } from "zod";

export interface UsageRecord {
  userId: string;
  routeId: string;
  inputTokens: number;
  outputTokens: number;
  occurredAt: string;
}

export function validateModelOutput<T>(schema: z.ZodType<T>, value: unknown) {
  return schema.parse(value);
}

export async function runWithValidation<T>(
  schema: z.ZodType<T>,
  candidates: Array<() => Promise<unknown>>,
): Promise<{ data: T; attempts: number; escalated: boolean }> {
  let lastError: unknown;
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      const result = await candidates[index]!();
      return { data: schema.parse(result), attempts: index + 1, escalated: index > 0 };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Every model route failed schema validation");
}

export function enforceDailyTokenCap(usage: UsageRecord[], userId: string, cap: number, requestedTokens: number, now: string) {
  const day = now.slice(0, 10);
  const used = usage
    .filter((record) => record.userId === userId && record.occurredAt.slice(0, 10) === day)
    .reduce((total, record) => total + record.inputTokens + record.outputTokens, 0);
  if (used + requestedTokens > cap) throw new Error("Daily AI token cap exceeded");
  return { used, remaining: cap - used - requestedTokens };
}
