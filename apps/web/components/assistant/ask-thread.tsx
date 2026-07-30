"use client";

import { BookOpen, BrainCircuit, Code2, Copy, Edit3, FileSearch, FolderKanban, GitBranch, LoaderCircle, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, CitationChip } from "@/components/ui";
import { conceptLabel } from "@/lib/labels";
import { text, type WorkspaceState } from "@/components/workspace/types";
import { ContextInspector } from "./context-inspector";
import { chipKind, type AssistantMessage, type UsedContext } from "./types";
import { useAssistant } from "./use-assistant";

/** §11.6: at most four chips, the rest behind `+n more`. */
const VISIBLE_CHIPS = 4;

/**
 * Four starters derived from real state. The rotating greeting above them is
 * gone (S16): a stable heading is calmer, and a heading that changes on every
 * render cannot be asserted in a test.
 */
function starterActions(state: WorkspaceState) {
  const weak = state.learningStates.find((item) => ["misconception_detected", "decaying"].includes(text(item, "status")));
  const activeTask = state.tasks.find((item) => text(item, "status") !== "done");
  const project = state.projects[0];
  return [
    weak
      ? { icon: BrainCircuit, label: "Review my weak concepts", prompt: `Help me review ${conceptLabel(text(weak, "conceptId"), "my weakest concept")}. Start by checking what I remember.` }
      : { icon: BookOpen, label: "Start a learning session", prompt: "Help me choose one concept to learn next and check what I already know." },
    project
      ? { icon: FileSearch, label: "Summarize my latest research", prompt: `Summarize the current state of ${text(project, "title")}, separating evidence, decisions, and unresolved questions.` }
      : { icon: FileSearch, label: "Explore my research", prompt: "Help me decide what research question to work on next." },
    { icon: Code2, label: "Help debug my code", prompt: "Help me debug a coding problem. Ask for the language, exact code, and actual error before suggesting a fix." },
    activeTask
      ? { icon: FolderKanban, label: "Organize today’s work", prompt: `Help me make a realistic plan starting with “${text(activeTask, "title")}”. Use my current tasks and schedule.` }
      : { icon: FolderKanban, label: "Organize today’s work", prompt: "Help me identify one useful next action from my goals." },
  ];
}

function CitationRow({ used, onInspect }: { used: UsedContext[]; onInspect: (record: UsedContext) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? used : used.slice(0, VISIBLE_CHIPS);
  return (
    <div className="assistant-citations">
      {shown.map((record) => (
        <CitationChip
          key={`${record.type}:${record.id}`}
          kind={chipKind(record.type)}
          label={record.label}
          onOpen={() => onInspect(record)}
        />
      ))}
      {!expanded && used.length > VISIBLE_CHIPS ? (
        <button type="button" className="assistant-citations-more" onClick={() => setExpanded(true)}>+{used.length - VISIBLE_CHIPS} more</button>
      ) : null}
    </div>
  );
}

/** §11.8: errors are in-thread blocks with a real next step, never a toast. */
function ThreadError({ error, onRetry, onDismiss, onFast }: {
  error: { message: string; kind: "rate_limit" | "provider" | "network" | "unknown" };
  onRetry: () => void;
  onDismiss: () => void;
  onFast: () => void;
}) {
  const copy = {
    rate_limit: "You’ve sent a lot of messages in a short time. Try again in a few minutes — your message is still in the composer.",
    provider: "Continuum’s model is busy right now. Retry, or switch to Fast for a lighter route.",
    network: "Lost connection. Your message is saved in the composer.",
    unknown: error.message,
  }[error.kind];
  return (
    <div className="assistant-error" role="alert">
      <span>{copy}</span>
      <div>
        <Button className="button-secondary" size="sm" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Retry</Button>
        {error.kind === "provider" ? <Button className="button-quiet" size="sm" onClick={onFast}>Use Fast</Button> : null}
        <Button className="button-quiet" size="sm" onClick={onDismiss}><X size={13} aria-hidden="true" />Dismiss</Button>
      </div>
    </div>
  );
}

export function AskThread({ state, compact = false }: { state: WorkspaceState; compact?: boolean }) {
  const assistant = useAssistant();
  const [inspecting, setInspecting] = useState<UsedContext>();
  const endRef = useRef<HTMLDivElement>(null);
  const starters = starterActions(state);
  const { messages, live, busy, error, confirmation } = assistant;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, live]);

  return (
    <div className={`assistant-thread ${messages.length || live ? "has-messages" : ""} ${compact ? "compact" : ""}`}>
      {assistant.loadingSession ? <div className="assistant-loading"><LoaderCircle className="spin" size={24} />Opening conversation…</div> : null}

      {!assistant.loadingSession && !messages.length && !live ? (
        <div className="assistant-welcome">
          <span><Sparkles size={22} /></span>
          <h1>What are you working on?</h1>
          <p>Continuum answers from your own goals, sources, study, and code — and shows you exactly what it used.</p>
          <div className="assistant-starters">
            {starters.map((starter) => {
              const Icon = starter.icon;
              return (
                <button key={starter.label} onClick={() => void assistant.send(starter.prompt)}>
                  <Icon size={18} />
                  <span><strong>{starter.label}</strong><small>{starter.prompt}</small></span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {messages.map((message) => (
        <MessageBlock key={message.id} message={message} onInspect={setInspecting} />
      ))}

      {busy ? (
        <article className="assistant-message assistant current">
          <div className="assistant-message-author"><Sparkles size={14} />Continuum</div>
          {live
            ? <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>{live}</ReactMarkdown>
            : <p className="assistant-thinking"><LoaderCircle className="spin" size={16} />{assistant.status}</p>}
        </article>
      ) : null}

      {/* §11.3 step 6 — nothing is retrieved until this is answered. */}
      {confirmation ? (
        <div className="assistant-confirmation" role="group" aria-label="Confirm search breadth">
          <p><Search size={15} aria-hidden="true" />{confirmation.question} <small>(~{confirmation.estimateSeconds}s)</small></p>
          <div>
            <Button className="button-primary" size="sm" onClick={() => assistant.resolveConfirmation("everything")}>Search everything</Button>
            <Button className="button-secondary" size="sm" onClick={() => assistant.resolveConfirmation("current")}>Just my current project</Button>
            <Button className="button-quiet" size="sm" onClick={() => assistant.resolveConfirmation("cancel")}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <ThreadError
          error={error}
          onRetry={assistant.retry}
          onDismiss={() => assistant.setDraft(assistant.draft)}
          onFast={() => { assistant.setMode("fast"); assistant.retry(); }}
        />
      ) : null}

      <div ref={endRef} />

      <ContextInspector
        record={inspecting}
        onClose={() => setInspecting(undefined)}
        onExclude={assistant.excludeRecord}
        excluded={Boolean(inspecting && assistant.excludedRecordIds.includes(inspecting.id))}
      />
    </div>
  );
}

function MessageBlock({ message, onInspect }: { message: AssistantMessage; onInspect: (record: UsedContext) => void }) {
  const assistant = useAssistant();
  const used = message.metadata?.usedContext ?? [];
  const isAssistant = message.role === "assistant";
  // AC-A6: an ungrounded answer says so. Absence of chips is not a statement.
  const ungrounded = isAssistant && message.metadata?.grounded === false && !used.length;

  return (
    <article className={`assistant-message ${message.role}`}>
      <div className="assistant-message-author">{isAssistant ? <><Sparkles size={14} />Continuum</> : "You"}</div>

      {isAssistant
        ? <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        : <p>{message.content}</p>}

      {message.stopped ? <p className="assistant-stopped">Stopped. <button type="button" onClick={assistant.retry}>Resume</button></p> : null}

      {used.length ? <CitationRow used={used} onInspect={onInspect} /> : null}

      {ungrounded ? (
        <p className="assistant-ungrounded">Answered from general knowledge — nothing in your workspace matched.</p>
      ) : null}

      {/* §11.3 step 11 — depth is offered, never assumed. */}
      {message.metadata?.depthOffer ? (
        <button
          type="button"
          className="assistant-depth-offer"
          onClick={() => {
            const previous = assistant.messages.filter((entry) => entry.role === "user").at(-1)?.content;
            if (previous) void assistant.send(previous, { broadSearch: message.metadata!.depthOffer === "use_project" ? "current" : "everything" });
          }}
        >
          <Search size={13} aria-hidden="true" />
          {message.metadata.depthOffer === "use_project" ? "Use my current project" : "Look through my sources"}
        </button>
      ) : null}

      {message.metadata?.degraded?.length ? (
        <p className="assistant-degraded">Some retrieval took too long, so this answer used less than usual: {message.metadata.degraded.join(", ")}.</p>
      ) : null}

      <div className="assistant-message-actions">
        <button onClick={() => void navigator.clipboard.writeText(message.content)}><Copy size={12} />Copy</button>
        {isAssistant
          ? <button onClick={assistant.retry}><RefreshCw size={12} />Regenerate</button>
          : <button onClick={() => { assistant.setDraft(message.content); document.querySelector<HTMLTextAreaElement>(".assistant-composer textarea")?.focus(); }}><Edit3 size={12} />Edit and resend</button>}
        <button onClick={() => void assistant.branchFrom(message.id)}><GitBranch size={12} />Branch from here</button>
      </div>
    </article>
  );
}
