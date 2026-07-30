"use client";

/**
 * Material and practice (redesign.md §14.1) — the third and last section.
 *
 * Two columns. Practice sets get **two** entry points because they have two
 * genuinely different starting materials: a file and a photograph of a
 * worksheet. Image extraction was previously reachable only from inside a
 * "Question banks" tab (S7, feature #44) despite being one of the strongest
 * things the product does, so it is named on the surface.
 *
 * Material gets exactly one button. The alternative — a picker for source type,
 * a time budget, a cost preference and a goal — is what the resource panel
 * replaced.
 */
import { Camera, FileText, Plus, Search } from "lucide-react";
import { Button, EmptyState, List, Row } from "@/components/ui";
import { formatLabel } from "@/lib/labels";
import { list, number, text, type Row as StateRow } from "@/components/workspace/types";

function bestScore(bank: StateRow) {
  const attempts = Array.isArray(bank.attempts) ? bank.attempts as Array<Record<string, unknown>> : [];
  const scores = attempts.map((attempt) => typeof attempt.score === "number" ? attempt.score : 0);
  return scores.length ? Math.round(Math.max(...scores) * 100) : undefined;
}

export function PracticeAndMaterial({
  questionBanks,
  sources,
  papers,
  onPractise,
  onNewSet,
  onNewSetFromPhoto,
  onFindMaterial,
}: {
  questionBanks: StateRow[];
  sources: StateRow[];
  papers: StateRow[];
  onPractise: (questionBankId: string) => void;
  onNewSet: () => void;
  onNewSetFromPhoto: () => void;
  onFindMaterial: () => void;
}) {
  const material = [
    ...papers.map((paper) => ({ id: text(paper, "id"), title: text(paper, "title"), meta: list(paper, "authors").slice(0, 2).join(", ") || "Paper" })),
    ...sources.map((source) => ({ id: text(source, "id"), title: text(source, "title"), meta: formatLabel(text(source, "mimeType", "document")) })),
  ];

  return (
    <div className="study-material-grid">
      <section aria-labelledby="study-practice-heading">
        <header className="study-subhead">
          <h3 id="study-practice-heading">Practice sets</h3>
          <div>
            <Button variant="secondary" size="sm" onClick={onNewSet}><Plus size={14} aria-hidden="true" />New set</Button>
            <Button variant="secondary" size="sm" onClick={onNewSetFromPhoto}><Camera size={14} aria-hidden="true" />From a photo</Button>
          </div>
        </header>
        {questionBanks.length ? (
          <List label="Practice sets" className="study-practice-list">
            {questionBanks.map((bank) => {
              const score = bestScore(bank);
              const count = list(bank, "questions").length || number(bank, "questionCount");
              return (
                <Row
                  key={text(bank, "id")}
                  density="compact"
                  title={text(bank, "title", "Practice set")}
                  meta={`${count} question${count === 1 ? "" : "s"}${score === undefined ? "" : ` · best ${score}%`}`}
                  actions={<Button variant="secondary" size="sm" onClick={() => onPractise(text(bank, "id"))}>Practise</Button>}
                />
              );
            })}
          </List>
        ) : (
          <EmptyState
            title="No practice sets yet"
            body="Build one from a document, or photograph a worksheet and Continuum will read the questions off it."
            action={<Button variant="primary" size="sm" onClick={onNewSetFromPhoto}><Camera size={14} aria-hidden="true" />From a photo</Button>}
          />
        )}
      </section>

      <section aria-labelledby="study-material-heading">
        <header className="study-subhead">
          <h3 id="study-material-heading">Material</h3>
          <Button variant="secondary" size="sm" onClick={onFindMaterial}><Search size={14} aria-hidden="true" />Find material</Button>
        </header>
        {material.length ? (
          <List label="Material attached to this goal" className="study-source-list">
            {material.map((item) => (
              <Row
                key={item.id}
                density="compact"
                leading={<FileText size={15} aria-hidden="true" />}
                title={item.title}
                meta={item.meta}
              />
            ))}
          </List>
        ) : (
          <EmptyState
            title="No material yet"
            body="Continuum ranks reviewed explanations, practice, and exam material against what you are trying to do."
            action={<Button variant="primary" size="sm" onClick={onFindMaterial}><Search size={14} aria-hidden="true" />Find material</Button>}
          />
        )}
      </section>
    </div>
  );
}
