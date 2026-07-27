import JSZip from "jszip";
import { NextResponse } from "next/server";
import { enforceRateLimit, getRequestUser } from "@/lib/auth";
import { accountExportData } from "@/lib/account-data";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await enforceRateLimit(request, "account-export", 3, 24 * 60 * 60_000, user.id);
  if (!rate.allowed) return NextResponse.json({ error: "An account export was generated recently. Try again later." }, { status: 429 });
  const data = await accountExportData(user.id);
  const zip = new JSZip();
  const manifest = {
    format: "continuum-account-export",
    version: 1,
    exportedAt: data.exportedAt,
    files: [
      "account.json", "planning.json", "learning.json", "research.json",
      "memory.json", "assistant.json", "question-banks.json",
      "code-and-audit.json", "integrations.json", "obsidian-sync.json",
    ],
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("account.json", JSON.stringify(data.account, null, 2));
  zip.file("planning.json", JSON.stringify(data.planning, null, 2));
  zip.file("learning.json", JSON.stringify(data.learning, null, 2));
  zip.file("research.json", JSON.stringify(data.research, null, 2));
  zip.file("memory.json", JSON.stringify(data.memory, null, 2));
  zip.file("assistant.json", JSON.stringify(data.assistant, null, 2));
  zip.file("question-banks.json", JSON.stringify(data.questionBanks, null, 2));
  zip.file("code-and-audit.json", JSON.stringify(data.codeAndAudit, null, 2));
  zip.file("integrations.json", JSON.stringify(data.integrations, null, 2));
  zip.file("obsidian-sync.json", JSON.stringify(data.obsidianSync, null, 2));
  zip.file("README.txt", `${data.securityNotice}\n\nThis archive is machine-readable JSON and does not contain passwords, provider keys, credential ciphertext, token hashes, raw session identifiers, or security secrets.\n`);
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new Response(new Blob([body as Uint8Array<ArrayBuffer>]), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="continuum-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
