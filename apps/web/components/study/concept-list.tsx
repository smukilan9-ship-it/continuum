"use client";

/**
 * The Concepts section (redesign.md §14.1).
 *
 * A dense list, not a card grid and not a concept map: name, a three-segment
 * mini-bar with the **weakest segment labelled**, when it was last practised,
 * and one secondary action. Sorted by need.
 *
 * The mini-bar exists because a single averaged percentage hid which of the
 * three dimensions was actually weak (finding X8) — and because a bar with no
 * number attached is decoration. The weakest segment carries its name and its
 * value in text, so the information survives with colour removed.
 */
import { BookOpen } from "lucide-react";
import { Button, EmptyState, List, Row } from "@/components/ui";
import { lastPractisedLabel, type ConceptSignal } from "./mastery";

function MiniBar({ concept }: { concept: ConceptSignal }) {
  return (
    <span
      className="study-minibar"
      role="img"
      aria-label={concept.dimensions.map((dimension) => `${dimension.label} ${dimension.percent}%`).join(", ")}
    >
      {concept.dimensions.map((dimension) => (
        <span
          key={dimension.key}
          className={dimension.key === concept.weakest.key ? "study-minibar-segment is-weakest" : "study-minibar-segment"}
        >
          <i style={{ width: `${Math.max(2, dimension.percent)}%` }} />
        </span>
      ))}
      <em>{concept.weakest.label} {concept.weakest.percent}%</em>
    </span>
  );
}

export function ConceptList({
  concepts,
  onStudy,
  onAddMaterial,
}: {
  concepts: ConceptSignal[];
  onStudy: (concept: ConceptSignal) => void;
  onAddMaterial: () => void;
}) {
  if (!concepts.length) {
    return (
      <EmptyState
        title="No concepts tracked yet"
        body="Add material to this goal and Continuum will find the concepts in it."
        action={<Button variant="primary" size="sm" onClick={onAddMaterial}>Find material</Button>}
      />
    );
  }

  return (
    <List label="Concepts, most in need of work first" className="study-concept-list">
      {concepts.map((concept) => (
        <Row
          key={concept.conceptId}
          density="compact"
          title={
            <span className="study-concept-title">
              {/* An open misconception is an amber dot plus its label inline.
                  AC-LN3: the "Mastered" label is replaced, never shown beside it. */}
              {concept.openMisconception ? <i className="study-misconception-dot" aria-hidden="true" /> : null}
              {concept.title}
              {concept.openMisconception ? <em className="study-misconception-label">{concept.misconceptionLabel}</em> : null}
            </span>
          }
          meta={<MiniBar concept={concept} />}
          trailing={<span className="study-concept-when">{lastPractisedLabel(concept.lastPracticedAt)}</span>}
          actions={
            <Button variant="secondary" size="sm" onClick={() => onStudy(concept)}>
              <BookOpen size={14} aria-hidden="true" />Study
            </Button>
          }
        />
      ))}
    </List>
  );
}
