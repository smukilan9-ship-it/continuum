import { afterEach, describe, expect, it, vi } from "vitest";
import { selectFeatherlessModel } from "../packages/ai/src/featherless";

describe("Featherless catalog routing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses a task-specific curated fallback when catalog discovery is degraded", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/v1/plan")) return new Response(JSON.stringify({ id: "pro", name: "Pro", max_context_length: 32768, max_model_size: null, concurrency: 4 }), { status: 200 });
      return new Response("Gone.", { status: 404 });
    }));

    const selected = await selectFeatherlessModel("research_synthesis", {
      FEATHERLESS_API_KEY: "test-key",
    } as NodeJS.ProcessEnv);

    expect(selected).toMatchObject({
      id: "Qwen/Qwen3.6-27B",
      concurrencyCost: 2,
      selectedBy: "curated_fallback_policy",
    });
  });

  it("honors an explicit fallback override", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Gone.", { status: 404 })));
    await expect(selectFeatherlessModel("classification", {
      FEATHERLESS_API_KEY: "test-key",
      FEATHERLESS_FALLBACK_MODEL: "owner/reviewed-model",
      FEATHERLESS_MODEL_CONCURRENCY_COST: "3",
    } as NodeJS.ProcessEnv)).resolves.toMatchObject({ id: "owner/reviewed-model", concurrencyCost: 3 });
  });
});
