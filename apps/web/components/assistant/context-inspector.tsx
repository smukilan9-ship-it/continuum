"use client";

import { ExternalLink, ShieldOff } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { Button, SidePanel } from "@/components/ui";
import { hrefFor } from "@/lib/assistant/provenance";
import { formatLabel } from "@/lib/labels";
import type { UsedContext } from "./types";

/**
 * §11.6: clicking a citation chip opens exactly what the answer used — the
 * snippet that was sent, where it came from, and two actions.
 *
 * This is the honest half of the provenance fix. Chips alone would still be a
 * claim; the inspector is what makes the claim checkable, which is why C5 is
 * only closed once a user can read the passage the model was given.
 */
export function ContextInspector({
  record,
  onClose,
  onExclude,
  excluded,
}: {
  record: UsedContext | undefined;
  onClose: () => void;
  onExclude: (recordId: string) => void;
  excluded: boolean;
}) {
  return (
    <SidePanel
      open={Boolean(record)}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="What this answer used"
      width={420}
    >
      {record ? (
        <div className="context-inspector">
          <p className="context-inspector-kind">{formatLabel(record.type)}</p>
          <h3>{record.label}</h3>
          {record.snippet ? (
            <>
              <p className="context-inspector-caption">The exact text sent to the model:</p>
              <blockquote>{record.snippet}</blockquote>
            </>
          ) : (
            <p className="context-inspector-caption">
              This record was supplied as structured fields — its title, status, and dates — rather than as a passage of text.
            </p>
          )}
          <div className="context-inspector-actions">
            {/* Derived when the stored record has no href: messages persisted
                before provenance carried one — and the seeded demo
                conversations — would otherwise open an inspector with no way
                to follow the citation, which is the half that makes it
                checkable rather than just readable. */}
            <Link className="button button-secondary" href={(record.href ?? hrefFor(record.type, record.id)) as Route} onClick={onClose}>
              <ExternalLink size={14} aria-hidden="true" />Open
            </Link>
            <Button
              className="button-quiet"
              disabled={excluded}
              onClick={() => { onExclude(record.id); onClose(); }}
            >
              <ShieldOff size={14} aria-hidden="true" />
              {excluded ? "Excluded from this conversation" : "Don’t use this again"}
            </Button>
          </div>
          <p className="context-inspector-note">
            Excluding applies to this conversation only. To remove a record from every future answer, use Forget in Context.
          </p>
        </div>
      ) : null}
    </SidePanel>
  );
}
