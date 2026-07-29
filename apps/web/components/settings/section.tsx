"use client";

import type { ReactNode } from "react";

/**
 * One block inside a settings segment: a heading, one sentence of why it exists,
 * and the controls. Everything on this page is `max-width: 720px` (§9.11) —
 * settings are read line by line, and a 1,100px measure makes a switch and its
 * label land at opposite ends of the screen.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
  tone,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  tone?: "danger";
}) {
  return (
    <section className={tone === "danger" ? "settings-section settings-section-danger" : "settings-section"}>
      <header>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="settings-section-action">{action}</div> : null}
      </header>
      {children ? <div className="settings-section-body">{children}</div> : null}
    </section>
  );
}

/** A labelled read-only fact — username, version, endpoint. */
export function SettingsFact({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="settings-fact">
      <dt>{label}</dt>
      <dd>{value}{hint ? <small>{hint}</small> : null}</dd>
    </div>
  );
}
