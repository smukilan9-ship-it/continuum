import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GEMINI_GENERATION_PREFERENCE,
  isTripped,
  listGeminiModels,
  providerHealth,
  recordFailure,
  recordSuccess,
  resetBreakers,
  selectGeminiModel,
} from "../packages/ai/src/health";

const geminiEnv = { GEMINI_API_KEY_1: "k1", GEMINI_DATA_USE_ACKNOWLEDGED: "true" } as unknown as NodeJS.ProcessEnv;

function modelsResponse(ids: string[]) {
  return new Response(
    JSON.stringify({ models: ids.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ["generateContent"], inputTokenLimit: 1_000_000 })) }),
    { status: 200 },
  );
}

describe("circuit breaker", () => {
  beforeEach(() => resetBreakers());

  it("does not trip before the failure threshold", () => {
    recordFailure("route:groq", "boom");
    recordFailure("route:groq", "boom");
    expect(isTripped("route:groq")).toBe(false);
  });

  it("trips after three consecutive failures and skips the route", () => {
    for (let i = 0; i < 3; i += 1) recordFailure("route:groq", "boom");
    expect(isTripped("route:groq")).toBe(true);
  });

  it("resets on success", () => {
    for (let i = 0; i < 3; i += 1) recordFailure("route:groq", "boom");
    recordSuccess("route:groq");
    expect(isTripped("route:groq")).toBe(false);
  });

  it("re-closes after the cooldown lapses", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i += 1) recordFailure("route:gemini", "boom", now);
    expect(isTripped("route:gemini", now + 1_000)).toBe(true);
    expect(isTripped("route:gemini", now + 10 * 60_000)).toBe(false);
  });
});

describe("Gemini discovery + selection", () => {
  beforeEach(() => resetBreakers());
  afterEach(() => vi.unstubAllGlobals());

  it("discovers only generateContent-capable models", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      models: [
        { name: "models/gemini-flash-lite-latest", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
      ],
    }), { status: 200 })));
    const models = await listGeminiModels("k1");
    expect(models.find((m) => m.id === "gemini-flash-lite-latest")?.supportsGenerate).toBe(true);
    expect(models.find((m) => m.id === "text-embedding-004")?.supportsGenerate).toBe(false);
  });

  it("prefers a configured model when the account can call it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => modelsResponse(["gemini-flash-lite-latest", "gemini-3.6-flash"])));
    const chosen = await selectGeminiModel({ ...geminiEnv, GEMINI_MODEL: "gemini-3.6-flash" });
    expect(chosen).toBe("gemini-3.6-flash");
  });

  it("skips a configured model the account cannot call and falls to the preference list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => modelsResponse(["gemini-flash-lite-latest"])));
    const chosen = await selectGeminiModel({ ...geminiEnv, GEMINI_MODEL: "gemini-2.5-flash" });
    expect(chosen).toBe("gemini-flash-lite-latest");
    expect(GEMINI_GENERATION_PREFERENCE).toContain(chosen);
  });

  it("skips a tripped model", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => modelsResponse(["gemini-flash-lite-latest", "gemini-3.1-flash-lite"])));
    for (let i = 0; i < 3; i += 1) recordFailure("gemini:gemini-flash-lite-latest", "503");
    const chosen = await selectGeminiModel(geminiEnv);
    expect(chosen).toBe("gemini-3.1-flash-lite");
  });
});

describe("providerHealth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports not_configured providers without probing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("should not be called"); }));
    const reports = await providerHealth({} as NodeJS.ProcessEnv, { force: true });
    expect(reports.every((r) => r.status === "not_configured")).toBe(true);
  });
});
