import { getRequestUser } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function value(row: unknown, key: string) {
  return row && typeof row === "object" ? (row as Record<string, unknown>)[key] : undefined;
}

function line(row: unknown, key: string, fallback = "Untitled") {
  const current = value(row, key);
  return typeof current === "string" && current.trim() ? current.trim() : fallback;
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const format = new URL(request.url).searchParams.get("format") ?? "pack";
  if (!["pack", "query", "citations"].includes(format)) return new Response("Unsupported export format", { status: 400 });
  const store = getStore(user.id);
  const [research, memory, currentWeek] = await Promise.all([store.workspace("research"), store.workspace("memory"), store.read("get_context_pack", { packId: "current_week", maxTokens: 1200 }, "notebooklm-handoff")]);
  const projects = (research.projects as unknown[] | undefined) ?? [];
  const decisions = (research.projectDecisions as unknown[] | undefined) ?? [];
  const sources = (research.sources as unknown[] | undefined) ?? [];
  const papers = (research.papers as unknown[] | undefined) ?? [];
  const receipts = (memory.sessionReceipts as unknown[] | undefined) ?? [];
  const preparedQuery = [
    projects[0] ? `Research ${line(projects[0], "title")}: ${line(projects[0], "purpose", "synthesize the strongest available evidence")}.` : "Synthesize the strongest available evidence for my current academic project.",
    "Separate source-supported findings from inference, preserve limitations, surface disagreements, and cite every material claim.",
    ...receipts.slice(0, 5).flatMap((receipt) => ((value(receipt, "unresolvedQuestions") as string[] | undefined) ?? []).map((question) => `Resolve: ${question}`)),
  ].join("\n");
  const citations = papers.length
    ? papers.map((paper) => {
      const authors = Array.isArray(value(paper, "authors")) ? (value(paper, "authors") as string[]).join(", ") : "Unknown authors";
      const year = typeof value(paper, "year") === "number" ? ` (${String(value(paper, "year"))})` : "";
      const doi = line(paper, "doi", "");
      return `- ${authors}${year}. **${line(paper, "title")}**${doi ? `. https://doi.org/${doi}` : ""}`;
    })
    : ["- No saved paper citations yet. Save papers in Research, then export again."];
  if (format === "query") return new Response(preparedQuery, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  if (format === "citations") return new Response(["# Continuum citations", "", ...citations].join("\n"), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="continuum-citations-${new Date().toISOString().slice(0, 10)}.md"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  const output = [
    "# Continuum source pack",
    "",
    `Exported ${new Date().toISOString()}`,
    "",
    "> This is a deliberate handoff file for NotebookLM. Personal NotebookLM does not provide Continuum with an account-connection API, so you choose when to upload this file.",
    "",
    "## Projects",
    ...projects.flatMap((project) => [`### ${line(project, "title")}`, line(project, "purpose", "No purpose recorded."), `Phase: ${line(project, "phase", "Not set")}`, ""]),
    "## Decisions",
    ...decisions.flatMap((decision) => [`- ${line(decision, "text")}`, `  Reason: ${line(decision, "reasoning", "Not recorded")}`]),
    "",
    "## Indexed sources",
    ...sources.map((source) => `- ${line(source, "title")} (${line(source, "mimeType", "unknown type")})`),
    "",
    "## Prepared research query",
    "",
    preparedQuery,
    "",
    "## Saved paper citations",
    "",
    ...citations,
    "",
    "## Recent verified outcomes",
    ...receipts.slice(0, 20).flatMap((receipt) => [`### ${line(receipt, "summary")}`, ...((value(receipt, "completed") as string[] | undefined) ?? []).map((item) => `- Completed: ${item}`), ...((value(receipt, "unresolvedQuestions") as string[] | undefined) ?? []).map((item) => `- Unresolved: ${item}`), ""]),
    "## Current-week context pack",
    "",
    "> Compact private state selected by Continuum. Full history and credentials are omitted.",
    "",
    "```json",
    JSON.stringify(currentWeek, null, 2),
    "```",
  ].join("\n");
  return new Response(output, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="continuum-notebooklm-${new Date().toISOString().slice(0, 10)}.md"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
