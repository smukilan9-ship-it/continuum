"use client";

import { Play, Square } from "lucide-react";

import { Button, Select } from "@/components/ui";
import { EDITOR_ONLY_LANGUAGES } from "@/lib/code-execution";

import { RUNNABLE_LABELS } from "./language";

/**
 * The language menu and **the** Run control (redesign.md §14.3, AC-B2).
 *
 * There is exactly one Run control in the workspace. It is rendered once, here,
 * and swaps to Stop while a program is running; `build.css` repositions this
 * one node into a sticky bottom bar below 900px rather than rendering a second
 * button there. An earlier layout had a duplicate Run inside the input panel
 * that executed the same program with the same stdin and only created doubt.
 */
export function RunControls({
  language,
  runnable,
  running,
  canRun,
  onLanguageChange,
  onRun,
  onStop,
}: {
  language: string;
  runnable: boolean;
  running: boolean;
  canRun: boolean;
  onLanguageChange: (next: string) => void;
  onRun: () => void;
  onStop: () => void;
}) {
  return (
    <div className="build-run-slot">
      <label className="build-language">
        <span className="sr-only">Language</span>
        <Select aria-label="Language" value={language.toLowerCase()} onChange={(event) => onLanguageChange(event.target.value)}>
          <optgroup label="Ready to run">
            {RUNNABLE_LABELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </optgroup>
          <optgroup label="Editing only">
            {EDITOR_ONLY_LANGUAGES.map((option) => <option key={option} value={option.toLowerCase()}>{option}</option>)}
          </optgroup>
        </Select>
      </label>

      {running ? (
        <Button variant="secondary" className="build-run" onClick={onStop}>
          <Square size={14} aria-hidden="true" />Stop
        </Button>
      ) : (
        <Button variant="primary" className="build-run" disabled={!runnable || !canRun} onClick={onRun}>
          <Play size={15} aria-hidden="true" />Run<kbd className="build-run-kbd">⌘↵</kbd>
        </Button>
      )}
    </div>
  );
}
