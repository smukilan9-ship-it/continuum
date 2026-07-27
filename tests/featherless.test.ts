import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  featherlessCredentialHealth,
  featherlessCredentials,
  recordFeatherlessCredentialFailure,
  resetFeatherlessCredentialState,
  selectFeatherlessCredential,
  selectFeatherlessModel,
} from "../packages/ai/src/featherless";

describe("Featherless catalog routing", () => {
  beforeEach(() => resetFeatherlessCredentialState());
  afterEach(() => vi.unstubAllGlobals());

  it("uses a task-specific curated fallback when catalog discovery is degraded", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/v1/plan")) return new Response(JSON.stringify({ id: "pro", name: "Pro", max_context_length: 32768, max_model_size: null, concurrency: 4 }), { status: 200 });
      return new Response("Gone.", { status: 404 });
    }));

    const selected = await selectFeatherlessModel("research_synthesis", {
      FEATHERLESS_API_KEY_PRIMARY: "test-key",
    } as NodeJS.ProcessEnv);

    // Live-verified curated fallback: Featherless removed /v1/models (404 "Gone"),
    // so discovery is degraded and the selector uses a real, non-empty model.
    expect(selected).toMatchObject({
      id: "Qwen/Qwen2.5-72B-Instruct",
      concurrencyCost: 2,
      selectedBy: "curated_fallback_policy",
    });
  });

  it("honors an explicit fallback override", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Gone.", { status: 404 })));
    await expect(selectFeatherlessModel("classification", {
      FEATHERLESS_API_KEY_PRIMARY: "test-key",
      FEATHERLESS_FALLBACK_MODEL: "owner/reviewed-model",
      FEATHERLESS_MODEL_CONCURRENCY_COST: "3",
    } as NodeJS.ProcessEnv)).resolves.toMatchObject({ id: "owner/reviewed-model", concurrencyCost: 3 });
  });

  it("uses the fast override for summarization", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(selectFeatherlessModel("summarization", {
      FEATHERLESS_API_KEY_PRIMARY: "test-key",
      FEATHERLESS_FAST_MODEL: "owner/fast-summary-model",
      FEATHERLESS_REASONING_MODEL: "owner/reasoning-model",
    } as NodeJS.ProcessEnv)).resolves.toMatchObject({
      id: "owner/fast-summary-model",
      selectedBy: "configured_policy",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Featherless credential pool", () => {
  beforeEach(() => resetFeatherlessCredentialState());

  const env = {
    FEATHERLESS_API_KEY_PRIMARY: "primary-secret",
    FEATHERLESS_API_KEY_SECONDARY: "secondary-secret",
  } as NodeJS.ProcessEnv;

  it("uses only the two server-side slots and rotates stable identifiers", () => {
    expect(featherlessCredentials(env).map((credential) => credential.id)).toEqual(["primary", "secondary"]);
    expect(Array.from({ length: 4 }, () => selectFeatherlessCredential(env).id)).toEqual(["primary", "secondary", "primary", "secondary"]);
  });

  it("backs a rate-limited key off without exposing key material", () => {
    const first = selectFeatherlessCredential(env);
    recordFeatherlessCredentialFailure(first.id, new Error("request failed (429)"), 1_000);
    expect(selectFeatherlessCredential(env, 1_001).id).not.toBe(first.id);
    const health = featherlessCredentialHealth(env, 1_001);
    expect(health.find((entry) => entry.id === first.id)?.status).toBe("backing_off");
    expect(JSON.stringify(health)).not.toContain("secret");
  });

  it("refuses to create a retry storm while every key is backing off", () => {
    for (const credential of featherlessCredentials(env)) recordFeatherlessCredentialFailure(credential.id, new Error("request failed (429)"), 1_000);
    expect(() => selectFeatherlessCredential(env, 1_001)).toThrow(/backing off/i);
  });
});
