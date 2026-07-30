"use client";

import { BookOpen, FileText, FlaskConical, HelpCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, LoadingState } from "@/components/ui";
import { useAssistant } from "@/components/assistant/use-assistant";
import { formatDate, list, text, type Row } from "@/components/workspace/types";
import { formatLabel, statusTone } from "@/lib/labels";
import "./project.css";

type ProjectView = "overview" | "sources" | "claims" | "decisions";

const VIEWS: Array<{ id: ProjectView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "sources", label: "Sources" },
  { id: "claims", label: "Claims" },
  { id: "decisions", label: "Decisions" },
];

function isProjectView(value: unknown): value is ProjectView {
  return VIEWS.some((entry) => entry.id === value);
}

function rows(payload: Record<string, unknown>, key: string): Row[] {
  const value = payload[key];
  return Array.isArray(value) ? value as Row[] : [];
}

/**
 * `/g/[goalId]/p/[projectId]` — §13.1.
 *
 * A project lives inside the goal it serves (fixes C3), so this screen carries
 * a breadcrumb rather than a project switcher (AC-P2), and paper search is a
 * link to the Library's Discover tab rather than a second search surface
 * (AC-P3). Views fetch independently from `GET /api/projects/[id]?view=`.
 */
export function ProjectScreen({ goalId, projectId, goalTitle }: {
  goalId: string;
  projectId: string;
  goalTitle: string | undefined;
}) {
  const assistant = useAssistant();
  const [view, setView] = useState<ProjectView>("overview");
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const cache = useRef(new Map<ProjectView, Record<string, unknown>>());
  const tabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const apply = () => {
      const requested = new URLSearchParams(window.location.search).get("view");
      setView(isProjectView(requested) ? requested : "overview");
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  const load = useCallback(async (target: ProjectView) => {
    const cached = cache.current.get(target);
    if (cached) { setPayload(cached); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}?view=${target}`, { cache: "no-store" });
      if (response.status === 404) { setMissing(true); return; }
      const body = await response.json() as { data?: Record<string, unknown> };
      if (response.ok && body.data) { cache.current.set(target, body.data); setPayload(body.data); }
    } catch { /* The previous view stays on screen rather than blanking. */ } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(view); }, [load, view]);

  function selectView(next: ProjectView) {
    setView(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.pushState({ view: next }, "", url);
  }

  function onTabKeyDown(event: React.KeyboardEvent) {
    const index = VIEWS.findIndex((entry) => entry.id === view);
    const move = (next: number) => {
      event.preventDefault();
      const wrapped = (next + VIEWS.length) % VIEWS.length;
      selectView(VIEWS[wrapped]!.id);
      tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[wrapped]?.focus();
    };
    if (event.key === "ArrowRight") move(index + 1);
    else if (event.key === "ArrowLeft") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(VIEWS.length - 1);
  }

  const project = payload.project as Row | undefined;
  const title = text(project, "title", "Project");

  if (missing) {
    return (
      <div className="screen project-screen">
        <EmptyState
          title="This project isn’t here"
          body="It may have been deleted, or it belongs to another account."
          action={<Link className="button button-primary button-sm" href={`/g/${encodeURIComponent(goalId)}` as Route}>Back to the goal</Link>}
        />
      </div>
    );
  }

  return (
    <div className="screen project-screen">
      <header className="project-header">
        <nav className="project-breadcrumb" aria-label="Breadcrumb">
          <Link href={`/g/${encodeURIComponent(goalId)}` as Route}>{goalTitle ?? "Goal"}</Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{title}</span>
        </nav>
        <div className="project-header-line">
          <h1>{title}</h1>
          <Badge tone={statusTone(text(project, "phase", "active"))}>{formatLabel(text(project, "phase", "active"))}</Badge>
          <Button
            className="button-secondary compact-button"
            onClick={() => assistant.askFromPage({ page: { kind: "project", id: projectId, label: `Project: ${title}` } })}
          >
            <Sparkles size={14} aria-hidden="true" />Ask about this project
          </Button>
        </div>
        <p className="project-purpose">{text(project, "purpose")}</p>
        <nav ref={tabsRef} className="section-tabs" role="tablist" aria-label="Project sections" onKeyDown={onTabKeyDown}>
          {VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`project-tab-${entry.id}`}
              aria-selected={view === entry.id}
              aria-controls={`project-panel-${entry.id}`}
              tabIndex={view === entry.id ? 0 : -1}
              className={view === entry.id ? "active" : ""}
              onClick={() => selectView(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
      </header>

      <div id={`project-panel-${view}`} role="tabpanel" aria-labelledby={`project-tab-${view}`}>
        {loading ? <LoadingState label={`Loading ${view}`} /> : null}

        {!loading && view === "overview" ? (
          <div className="project-overview">
            <Card className="project-hero">
              <div className="card-kicker"><FlaskConical size={16} aria-hidden="true" /><span>Current phase</span></div>
              <h2>{formatLabel(text(project, "phase", "active"))}</h2>
              <p>{text(project, "purpose", "No purpose recorded for this project.")}</p>
            </Card>
            <div className="project-overview-grid">
              <Card>
                <div className="card-kicker"><FileText size={16} aria-hidden="true" /><span>Recent decisions</span></div>
                {rows(payload, "decisions").length ? (
                  <ul className="project-list">
                    {rows(payload, "decisions").slice(0, 2).map((decision) => (
                      <li key={text(decision, "id")}>
                        <strong>{text(decision, "text")}</strong>
                        <small>{formatLabel(text(decision, "status", "proposed"))}</small>
                      </li>
                    ))}
                  </ul>
                ) : <p>No decisions recorded yet.</p>}
              </Card>
              <Card>
                <div className="card-kicker"><HelpCircle size={16} aria-hidden="true" /><span>Open claims</span></div>
                {rows(payload, "claims").length ? (
                  <ul className="project-list">
                    {rows(payload, "claims").slice(0, 3).map((claim) => (
                      <li key={text(claim, "id")}>
                        <strong>{text(claim, "text")}</strong>
                        <small>{formatLabel(text(claim, "status", "unverified"))}</small>
                      </li>
                    ))}
                  </ul>
                ) : <p>No claims yet.</p>}
              </Card>
              <Card>
                <div className="card-kicker"><BookOpen size={16} aria-hidden="true" /><span>Notes</span></div>
                {rows(payload, "notes").length ? (
                  <ul className="project-list">
                    {rows(payload, "notes").slice(0, 3).map((note) => (
                      <li key={text(note, "id")}><strong>{text(note, "text").slice(0, 140)}</strong></li>
                    ))}
                  </ul>
                ) : <p>No notes saved against this project.</p>}
              </Card>
            </div>
          </div>
        ) : null}

        {!loading && view === "sources" ? (
          rows(payload, "sources").length || rows(payload, "papers").length ? (
            <div className="project-sources">
              <div className="project-sources-actions">
                {/* AC-P3: paper search exists at exactly one URL. */}
                <Link className="button button-secondary button-sm" href={`/library?tab=discover&target=p:${encodeURIComponent(projectId)}` as Route}>
                  <BookOpen size={14} aria-hidden="true" />Find papers
                </Link>
                <Link className="button button-secondary button-sm" href="/library?tab=sources">
                  <FileText size={14} aria-hidden="true" />Add source
                </Link>
              </div>
              {rows(payload, "papers").map((paper) => (
                <article className="project-source-row" key={text(paper, "id")}>
                  <span><BookOpen size={17} aria-hidden="true" /></span>
                  <div>
                    <strong>{text(paper, "title")}</strong>
                    <small>{list(paper, "authors").join(", ") || "Authors unavailable"}{paper.year ? ` · ${String(paper.year)}` : ""}</small>
                  </div>
                  <Badge tone={paper.sourceId ? "green" : "neutral"}>{paper.sourceId ? "Full source" : "Metadata"}</Badge>
                </article>
              ))}
              {rows(payload, "sources").map((source) => (
                <article className="project-source-row" key={text(source, "id")}>
                  <span><FileText size={17} aria-hidden="true" /></span>
                  <div>
                    <strong>{text(source, "title")}</strong>
                    <small>{text(source, "mimeType", "document")}</small>
                  </div>
                  <Badge tone={text(source, "processingState", "ready") === "ready" ? "neutral" : "orange"}>
                    {formatLabel(text(source, "processingState", "ready"))}
                  </Badge>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No material yet"
              body="Papers and files you save to this project appear here."
              action={<Link className="button button-primary button-sm" href={`/library?tab=discover&target=p:${encodeURIComponent(projectId)}` as Route}>Find papers</Link>}
            />
          )
        ) : null}

        {!loading && view === "claims" ? (
          rows(payload, "claims").length ? (
            <div className="project-ledger">
              {rows(payload, "claims").map((claim) => (
                <article className="project-ledger-row" key={text(claim, "id")}>
                  <div>
                    <strong>{text(claim, "text")}</strong>
                    <small>{text(claim, "createdBy", "you")}{claim.verificationModel ? " · verified by a model" : ""}</small>
                  </div>
                  {/* Status is text plus a badge, never colour alone. */}
                  <Badge tone={statusTone(text(claim, "status", "unverified"))}>{formatLabel(text(claim, "status", "unverified"))}</Badge>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No claims yet" body="Claims stay unverified until they cite a passage you own." />
          )
        ) : null}

        {!loading && view === "decisions" ? (
          rows(payload, "decisions").length ? (
            <div className="project-ledger">
              {rows(payload, "decisions").map((decision) => (
                <article className={`project-ledger-row${decision.supersedesId ? " is-superseded" : ""}`} key={text(decision, "id")}>
                  <div>
                    <strong>{text(decision, "text")}</strong>
                    <small>{text(decision, "reasoning")}</small>
                    <small>{decision.createdAt ? formatDate(decision.createdAt, { dateStyle: "medium" }) : ""}</small>
                  </div>
                  <Badge tone={statusTone(text(decision, "status", "proposed"))}>{formatLabel(text(decision, "status", "proposed"))}</Badge>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No decisions yet" body="Record a decision and the reasoning behind it so it survives the conversation it came from." />
          )
        ) : null}
      </div>
    </div>
  );
}
