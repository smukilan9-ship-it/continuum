"use client";

import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type UIEvent } from "react";

// A real code editor (CodeMirror 6) with syntax highlighting, line numbers,
// auto-indent, bracket completion, Tab-to-indent, and undo/redo.
//
// CodeMirror touches `document` at construction, so it cannot render on the
// server. Crucially, we do NOT load it via next/dynamic({ssr:false}): that keeps
// the surrounding subtree suspended while the chunk loads, which defers the
// parent screen's passive effects (e.g. session restore). Instead we render a
// plain <textarea> immediately and swap CodeMirror in from the editor's own
// effect — so the parent commits and its effects run right away, and a failed
// editor load degrades gracefully to a usable textarea.

type CodeMirrorModule = {
  CM: ComponentType<Record<string, unknown>>;
  extensionsFor: (language: string) => unknown[];
};

type EditorViewLike = {
  state: { doc: { lines: number; line: (line: number) => { from: number } } };
  dispatch: (value: unknown) => void;
  focus: () => void;
  contentDOM?: HTMLElement;
};

/** The keyboard contract, announced to assistive tech (redesign.md §14.3). */
const KEYBOARD_CONTRACT = "Tab indents, Shift+Tab outdents, Escape moves focus out of the editor.";

export function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  editable = true,
  minHeight = 260,
  fill = false,
  ariaLabel = "Code editor",
  focusLine,
}: {
  value: string;
  onChange: (value: string) => void;
  language: string;
  placeholder?: string;
  editable?: boolean;
  minHeight?: number;
  /** Fill the parent region and scroll internally, for the fixed Build frame. */
  fill?: boolean;
  ariaLabel?: string;
  focusLine?: number;
}) {
  const [mod, setMod] = useState<CodeMirrorModule | null>(null);
  const viewRef = useRef<EditorViewLike | undefined>(undefined);
  const gutterRef = useRef<HTMLDivElement>(null);
  const contractId = useId();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cm, py, sql, js, java, cpp, rust, view, commands] = await Promise.all([
          import("@uiw/react-codemirror"),
          import("@codemirror/lang-python"),
          import("@codemirror/lang-sql"),
          import("@codemirror/lang-javascript"),
          import("@codemirror/lang-java"),
          import("@codemirror/lang-cpp"),
          import("@codemirror/lang-rust"),
          import("@codemirror/view"),
          import("@codemirror/commands"),
        ]);
        const extensionsFor = (lang: string) => {
          const base = [view.keymap.of([commands.indentWithTab]), view.EditorView.lineWrapping];
          switch (lang.trim().toLowerCase()) {
            case "python":
            case "python & mysql":
            case "python_mysql":
            case "python-mysql":
              return [py.python(), ...base];
            case "sql":
              return [sql.sql(), ...base];
            case "javascript":
              return [js.javascript(), ...base];
            case "typescript":
              return [js.javascript({ typescript: true }), ...base];
            case "java":
              return [java.java(), ...base];
            case "c++":
            case "cpp":
            case "c":
              return [cpp.cpp(), ...base];
            case "rust":
              return [rust.rust(), ...base];
            default:
              return base;
          }
        };
        if (alive) setMod({ CM: cm.default as ComponentType<Record<string, unknown>>, extensionsFor });
      } catch {
        /* keep the textarea fallback — the editor is optional */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const extensions = useMemo(() => (mod ? mod.extensionsFor(language) : []), [mod, language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !focusLine) return;
    const bounded = Math.max(1, Math.min(view.state.doc.lines, focusLine));
    const from = view.state.doc.line(bounded).from;
    view.dispatch({ selection: { anchor: from }, scrollIntoView: true });
    view.focus();
  }, [focusLine, value]);

  if (!mod) {
    // Tab indents inside CodeMirror, so the fallback keeps Tab as "leave the
    // field" — and Escape blurs in both, so neither is a keyboard trap.
    const lines = value.split("\n").length;
    return (
      <div className={fill ? "code-editor-fallback-shell code-editor-fill" : "code-editor-fallback-shell"}>
        <div className="code-editor-gutter" aria-hidden="true" ref={gutterRef}>
          {Array.from({ length: Math.max(lines, 1) }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>
        <textarea
          className="code-editor-fallback"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event: UIEvent<HTMLTextAreaElement>) => {
            if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); event.currentTarget.blur(); } }}
          placeholder={placeholder}
          spellCheck={false}
          aria-label={ariaLabel}
          aria-describedby={contractId}
          readOnly={!editable}
          style={fill ? undefined : { minHeight }}
        />
        <span id={contractId} className="sr-only">{KEYBOARD_CONTRACT}</span>
      </div>
    );
  }

  const CM = mod.CM;
  return (
    <div className={fill ? "code-editor-shell code-editor-fill" : "code-editor-shell"}>
      <CM
        value={value}
        onChange={onChange}
        editable={editable}
        placeholder={placeholder}
        extensions={extensions}
        // CodeMirror gives `.cm-content` role="textbox"; a label on the wrapper
        // does not reach it, so the name has to be set on the editable element.
        onCreateEditor={(view: EditorViewLike) => {
          viewRef.current = view;
          const content = view.contentDOM;
          if (!content) return;
          content.setAttribute("aria-label", ariaLabel);
          content.setAttribute("aria-describedby", contractId);
          // Escape must release focus — an editor that swallows Tab and never
          // yields focus is a keyboard trap (§14.3, WCAG 2.1.2). Registered on
          // the DOM node in the capture phase so it wins over CodeMirror's own
          // Escape binding without needing a precedence wrapper.
          content.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            content.blur();
          }, { capture: true });
        }}
        minHeight={fill ? undefined : `${minHeight}px`}
        height={fill ? "100%" : undefined}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
          autocompletion: false,
          foldGutter: false,
          searchKeymap: false,
        }}
        theme="light"
      />
      <span id={contractId} className="sr-only">{KEYBOARD_CONTRACT}</span>
    </div>
  );
}
