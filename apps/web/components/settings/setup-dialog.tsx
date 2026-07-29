"use client";

import { ExternalLink, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Banner, Button, Checkbox, Field, Input, LoadingButton, Modal } from "@/components/ui";

export type TestResult = { ok: boolean; message: string };

export type SetupLink = { label: string; href: string };

/**
 * The numbered instructions every setup dialog opens with (§9.10). They are an
 * `<ol>` rather than prose because the user is following them with one hand on
 * another browser tab, and a step they can lose their place in is a step they
 * abandon.
 */
export function SetupSteps({ steps, links }: { steps: ReactNode[]; links?: SetupLink[] }) {
  return (
    <div className="setup-steps">
      <ol>{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
      {links?.length ? (
        <div className="setup-links">
          {links.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
              {link.label}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A paste field with show/hide. Secrets arrive by copy-paste, and a masked field
 * with no reveal is the single most common reason a correct key is retyped
 * wrongly three times — so the reveal is part of the control, not an extra.
 */
export function SecretField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  minLength,
  maxLength,
  autoFocus,
  required = true,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <div className="secret-input">
          <Input
            id={id}
            aria-describedby={describedBy}
            type={shown ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            required={required}
            minLength={minLength}
            maxLength={maxLength}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            type="button"
            aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={shown}
            onClick={() => setShown((current) => !current)}
          >
            {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        </div>
      )}
    </Field>
  );
}

/**
 * Test-before-save (§9.10). The result is announced politely rather than
 * shouted, because the user pressed the button and is already looking at it.
 */
export function TestConnection({
  onTest,
  busy,
  disabled,
  result,
  label = "Test connection",
}: {
  onTest: () => void;
  busy?: boolean;
  disabled?: boolean;
  result?: TestResult;
  label?: string;
}) {
  return (
    <div className="setup-test">
      <Button variant="secondary" type="button" disabled={busy || disabled} onClick={onTest}>
        <RefreshCw size={14} className={busy ? "spin" : undefined} aria-hidden="true" />
        {busy ? "Testing…" : label}
      </Button>
      <div aria-live="polite">
        {result ? (
          <Banner tone={result.ok ? "success" : "danger"} title={result.ok ? "Connection successful" : "Connection failed"}>
            {result.message}
          </Banner>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One dialog shape for every provider: steps, the provider's own page, a paste
 * field, a real test, then a save that only unlocks once the test passed.
 *
 * `Save anyway` is deliberate rather than a loophole. A key can be valid while
 * the provider is briefly unreachable, and refusing to save in that case leaves
 * the user with nowhere to go; the override is explicit, opt-in, and only
 * appears after a test has actually been attempted and failed.
 */
export function SetupDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  formId,
  dirty,
  dirtyMessage,
  testPassed,
  testAttempted,
  blocked = false,
  saving,
  savingLabel = "Saving…",
  saveLabel = "Save",
  secondaryAction,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  formId?: string;
  dirty?: boolean;
  dirtyMessage?: string;
  testPassed: boolean;
  testAttempted: boolean;
  /** A requirement the override cannot waive — a password the server will demand. */
  blocked?: boolean;
  saving?: boolean;
  savingLabel?: string;
  saveLabel?: string;
  secondaryAction?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const [override, setOverride] = useState(false);
  const overrideId = useId();
  const showOverride = testAttempted && !testPassed;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => { if (!next) setOverride(false); onOpenChange(next); }}
      title={title}
      description={description}
      size={size}
      dirty={dirty}
      dirtyMessage={dirtyMessage}
      footer={
        <>
          {secondaryAction}
          {showOverride ? (
            <Checkbox
              id={overrideId}
              className="setup-override"
              checked={override}
              onChange={(event) => setOverride(event.target.checked)}
              label="Save anyway"
            />
          ) : null}
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton
            variant="primary"
            form={formId}
            type={formId ? "submit" : "button"}
            loading={saving}
            loadingLabel={savingLabel}
            disabled={blocked || (!testPassed && !override)}
          >
            {saveLabel}
          </LoadingButton>
        </>
      }
    >
      {children}
    </Modal>
  );
}
