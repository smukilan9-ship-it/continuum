import { z } from "zod";
import type { LessonOutput } from "@continuum/schemas";

const generatedLesson = z.object({
  title: z.string().min(3).max(160),
  explanation: z.string().min(20).max(3000),
  checksForUnderstanding: z.array(z.string().min(3)).min(1).max(5),
});

export function localOllamaConfiguration() {
  if (typeof window === "undefined") return undefined;
  const baseUrl = window.localStorage.getItem("continuum_ollama_url");
  const model = window.localStorage.getItem("continuum_ollama_model");
  if (!baseUrl || !model) return undefined;
  const url = new URL(baseUrl);
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) return undefined;
  return { baseUrl: url.origin, model };
}

export async function generateLocalOllamaLesson(): Promise<LessonOutput> {
  const config = localOllamaConfiguration();
  if (!config) throw new Error("Local Ollama has not been tested and saved");
  const response = await fetch(new URL("/api/chat", config.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      format: {
        type: "object",
        required: ["title", "explanation", "checksForUnderstanding"],
        properties: {
          title: { type: "string" },
          explanation: { type: "string" },
          checksForUnderstanding: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
        },
      },
      options: { temperature: 0.2, num_predict: 700 },
      messages: [
        { role: "system", content: "Return only the requested JSON. Explain accurately and concisely. Do not invent citations." },
        { role: "user", content: "Create a CBSE Class 12 contrastive lesson: electric potential V is a property of location/source configuration, while potential energy U=qV depends on the test charge. Include one teach-back check." },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Local Ollama returned ${response.status}`);
  const payload = await response.json() as { message?: { content?: string } };
  const content = payload.message?.content;
  if (!content) throw new Error("Local Ollama returned no lesson");
  const parsed = generatedLesson.parse(JSON.parse(content));
  return {
    id: `lesson_ollama_${Date.now()}`,
    conceptId: "concept_potential",
    ...parsed,
    sourceChunkIds: ["chunk_physics_seed_2"],
    evidenceState: "model_inference",
    promptVersion: "ollama-local-v1",
    model: `ollama/${config.model}`,
  };
}
