import { createHash, randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { contentHash, sanitizeUntrustedContent } from "@continuum/retrieval";
import { NextResponse } from "next/server";
import { enforceRateLimit, getRequestUser, sameOriginWrite } from "@/lib/auth";
import {
  detectQuestionImageType,
  extractQuestionsFromImages,
  imageQuestionLimits,
  normalizeQuestionDocument,
  toQuestionBankQuestions,
} from "@/lib/image-question-extraction";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function id(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function safeTitle(value: string) {
  return value.normalize("NFKC").replaceAll("\0", "").replace(/[^\p{L}\p{N} ._()-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 240);
}

function publicBank(bank: Record<string, unknown>) {
  return {
    ...bank,
    createdAt: bank.createdAt instanceof Date ? bank.createdAt.toISOString() : bank.createdAt,
    updatedAt: bank.updatedAt instanceof Date ? bank.updatedAt.toISOString() : bank.updatedAt,
  };
}

export async function POST(request: Request) {
  if (!sameOriginWrite(request)) return NextResponse.json({ error: "Cross-origin image extraction is not allowed" }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "question-image-extraction", Number(process.env.QUESTION_IMAGE_EXTRACTIONS_PER_HOUR ?? 12), 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "Image extraction limit reached. Try again later." }, { status: 429, headers: { "retry-after": "3600" } });
  const form = await request.formData().catch(() => undefined);
  const file = form?.get("file");
  const requestedTitle = typeof form?.get("title") === "string" ? safeTitle(String(form.get("title"))) : "";
  const topic = typeof form?.get("topic") === "string" ? safeTitle(String(form.get("topic"))) : "";
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PNG, JPEG, WebP, or scanned PDF" }, { status: 400 });
  if (!file.size) return NextResponse.json({ error: "The uploaded image is empty" }, { status: 400 });
  if (file.size > imageQuestionLimits.bytes) return NextResponse.json({ error: "Image question banks are limited to 20 MB" }, { status: 413 });
  const fileName = safeTitle(file.name);
  if (!fileName) return NextResponse.json({ error: "The uploaded filename is invalid" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectQuestionImageType(bytes);
  if (!mimeType) return NextResponse.json({ error: "The file signature is not a supported PNG, JPEG, WebP, or PDF" }, { status: 415 });
  const hash = createHash("sha256").update(bytes).digest("hex");
  const store = getStore(user.id);
  const cached = await store.getImageExtractionByHash(hash);
  if (cached?.status === "ready") {
    const structure = cached.structure as Record<string, unknown> | undefined;
    const questionBankId = typeof structure?.questionBankId === "string" ? structure.questionBankId : undefined;
    const bank = questionBankId ? await store.getQuestionBank(questionBankId) : undefined;
    if (bank) return NextResponse.json({ cached: true, extractionId: cached.id, questionBank: publicBank(bank) }, { headers: { "x-continuum-cache": "hit" } });
  }

  const extractionId = typeof cached?.id === "string" ? cached.id : `image_extraction_${createHash("sha256").update(`${user.id}:${hash}`).digest("hex").slice(0, 24)}`;
  const startedAt = Date.now();
  let assetPaths: string[] = Array.isArray(cached?.assetPaths) ? cached.assetPaths.map(String) : [];
  await store.saveImageExtraction({
    id: extractionId,
    userId: user.id,
    contentHash: hash,
    status: "processing",
    structure: { fileName, startedAt: new Date(startedAt).toISOString() },
    assetPaths,
  });

  try {
    const pages = await normalizeQuestionDocument(bytes, mimeType);
    const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
    if (store.kind === "neon" && !blobConfigured) throw new Error("Private image storage is not configured");
    if (blobConfigured) {
      assetPaths = [];
      for (const page of pages) {
        const stored = await put(`question-images/${user.id}/${extractionId}/page-${page.page}-${page.contentHash.slice(0, 12)}.png`, page.bytes, {
          access: "private",
          contentType: "image/png",
          addRandomSuffix: false,
          abortSignal: AbortSignal.timeout(15_000),
        });
        assetPaths.push(stored.url);
      }
    } else {
      assetPaths = pages.map((page) => `data:image/png;base64,${page.bytes.toString("base64")}`);
    }

    const extracted = await extractQuestionsFromImages(pages);
    if (!extracted.questions.length) {
      await store.saveImageExtraction({
        id: extractionId,
        userId: user.id,
        contentHash: hash,
        status: "no_questions",
        structure: { title: extracted.title, pages: pages.length, questions: [] },
        assetPaths,
        injectionDetected: extracted.injectionDetected,
        error: "No questions were detected",
      });
      return NextResponse.json({ error: "No academic questions were detected. Try a clearer crop or a page that contains complete questions.", extractionId }, { status: 422 });
    }

    const pageChunkIds = new Map<number, string>();
    const sourceId = `source_image_${createHash("sha256").update(`${user.id}:${hash}`).digest("hex").slice(0, 20)}`;
    const questions = toQuestionBankQuestions(extracted, extractionId, new Map());
    const chunks = pages.map((page) => {
      const pageText = questions
        .filter((question) => question.sourceRegion?.page === page.page)
        .map((question) => [question.prompt, question.expectedAnswer, question.explanation].filter(Boolean).join("\n"))
        .join("\n\n");
      const { sanitized } = sanitizeUntrustedContent(pageText || `Scanned question-bank page ${page.page}.`);
      const chunkId = `${sourceId}_page_${page.page}`;
      pageChunkIds.set(page.page, chunkId);
      return {
        id: chunkId,
        sourceId,
        passage: page.page,
        content: sanitized.slice(0, 80_000),
        contentHash: contentHash(sanitized),
      };
    });
    const finalQuestions = toQuestionBankQuestions(extracted, extractionId, pageChunkIds);
    const title = requestedTitle || extracted.title || fileName.replace(/\.(png|jpe?g|webp|pdf)$/i, "");
    await store.saveSource({
      id: sourceId,
      userId: user.id,
      title,
      mimeType,
      storagePath: assetPaths[0],
      contentHash: hash,
      sourceVersion: 1,
      parserVersion: "continuum-image-questions-v1",
      chunks,
    });
    const conceptId = await store.ensureConcept(topic || title);
    const questionBank = await store.saveQuestionBank({
      id: id("question_bank"),
      userId: user.id,
      sourceId,
      conceptId,
      title,
      status: "review_required",
      mode: "mixed_review",
      questions: finalQuestions,
      injectionDetected: extracted.injectionDetected,
    }) as Record<string, unknown>;
    await store.saveImageExtraction({
      id: extractionId,
      userId: user.id,
      contentHash: hash,
      sourceId,
      status: "ready",
      structure: {
        title,
        questionBankId: questionBank.id,
        pageCount: pages.length,
        questionCount: finalQuestions.length,
        durationMs: Date.now() - startedAt,
        parserVersion: "continuum-image-questions-v1",
      },
      assetPaths,
      injectionDetected: extracted.injectionDetected,
    });
    await store.appendEvent({
      type: "learning.question.image.extracted",
      summary: `Extracted ${finalQuestions.length} reviewable question${finalQuestions.length === 1 ? "" : "s"} from ${pages.length} image page${pages.length === 1 ? "" : "s"}.`,
      entityIds: [String(questionBank.id), extractionId, sourceId],
      payload: {
        contentHash: hash,
        pageCount: pages.length,
        questionCount: finalQuestions.length,
        injectionDetected: extracted.injectionDetected,
        durationMs: Date.now() - startedAt,
      },
      importance: 0.58,
    });
    return NextResponse.json({
      cached: false,
      extractionId,
      questionBank: publicBank(questionBank),
      pageCount: pages.length,
      reviewRequired: true,
    }, { status: 201, headers: { "x-continuum-cache": "miss" } });
  } catch (error) {
    const safeError = error instanceof Error && /pixel|page|private image storage|temporarily unavailable|no readable/i.test(error.message)
      ? error.message
      : "The image could not be safely extracted. Try a clearer image or a smaller scanned PDF.";
    await store.saveImageExtraction({
      id: extractionId,
      userId: user.id,
      contentHash: hash,
      status: "failed",
      structure: { fileName, durationMs: Date.now() - startedAt },
      assetPaths,
      error: safeError,
    }).catch(() => undefined);
    return NextResponse.json({ error: safeError, extractionId }, { status: safeError.includes("temporarily") ? 503 : 422 });
  }
}
