"use client";

import * as Popover from "@radix-ui/react-popover";
import { HelpCircle, MoreHorizontal } from "lucide-react";
import { useId, type ReactNode } from "react";

export type PageStat = { label: string; value: ReactNode; singular?: string };

/**
 * Stat labels are written plural because that is the common case, which
 * rendered "1 papers" / "1 goals" / "1 blocks". Depluralise when the value is
 * exactly one. `singular` overrides it for irregular words.
 */
function statLabel(stat: PageStat) {
  if (stat.value !== 1 && stat.value !== "1") return stat.label;
  if (stat.singular) return stat.singular;
  const label = stat.label;
  if (/\bies$/.test(label)) return label.replace(/ies$/, "y");
  if (/(ch|sh|ss|x|z)es$/.test(label)) return label.replace(/es$/, "");
  if (/[^s]s$/.test(label)) return label.replace(/s$/, "");
  return label;
}

/**
 * The compact page header that replaced the per-screen marketing hero.
 *
 * Every screen used to open with an uppercase eyebrow, a 40 px editorial
 * headline, and a two-line description — roughly 250 px of the most valuable
 * space on the page, on every navigation, every day. On Research it pushed the
 * tab bar ~650 px down.
 *
 * Nothing is deleted: the title moves to one dense line, the stats that lived in
 * a separate card move to the second line, and the descriptive copy moves into
 * the `?` popover so the explanation stays one click away. Target height ≤96 px.
 */
export function PageHeader({
  title,
  context,
  description,
  stats,
  actions,
  overflow,
  children,
}: {
  title: string;
  context?: ReactNode;
  description?: string;
  stats?: PageStat[];
  actions?: ReactNode;
  overflow?: ReactNode;
  children?: ReactNode;
}) {
  const descriptionId = useId();
  return (
    <header className="page-header">
      <div className="page-header-line">
        <h1>{title}</h1>
        {context ? <div className="page-header-context">{context}</div> : null}
        {description ? (
          <Popover.Root>
            <Popover.Trigger className="page-header-help" aria-label={`What is ${title} for?`}><HelpCircle size={15} /></Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="page-header-popover" sideOffset={8} align="start" id={descriptionId}>
                <strong>{title}</strong>
                <p>{description}</p>
                <Popover.Arrow className="page-header-popover-arrow" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : null}
        <div className="page-header-actions">
          {actions}
          {overflow ? (
            <Popover.Root>
              <Popover.Trigger className="page-header-overflow" aria-label={`More ${title} actions`}><MoreHorizontal size={16} /></Popover.Trigger>
              <Popover.Portal>
                <Popover.Content className="page-header-menu" sideOffset={8} align="end">{overflow}<Popover.Arrow className="page-header-popover-arrow" /></Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ) : null}
        </div>
      </div>
      {stats?.length ? (
        <dl className="page-header-stats">
          {stats.map((stat) => <div key={stat.label}><dt>{statLabel(stat)}</dt><dd>{stat.value}</dd></div>)}
        </dl>
      ) : null}
      {children}
    </header>
  );
}
