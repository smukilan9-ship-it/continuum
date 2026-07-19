import { afterEach, describe, expect, it, vi } from "vitest";
import { preferredGroqModel, selectGroqModel } from "../packages/ai/src/groq";

describe("Groq routing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses reviewed task-specific defaults without requiring public model env vars", () => {
    expect(preferredGroqModel("classification", {} as NodeJS.ProcessEnv)).toBe("llama-3.1-8b-instant");
    expect(preferredGroqModel("research_synthesis", {} as NodeJS.ProcessEnv)).toBe("qwen/qwen3.6-27b");
    expect(preferredGroqModel("code_reasoning", {} as NodeJS.ProcessEnv)).toBe("openai/gpt-oss-120b");
  });

  it("validates the selected model against the authenticated catalog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "llama-3.1-8b-instant", active: true }] }), { status: 200 })));
    await expect(selectGroqModel("classification", { GROQ_API_KEY: "test-key" } as NodeJS.ProcessEnv)).resolves.toBe("llama-3.1-8b-instant");
  });
});
