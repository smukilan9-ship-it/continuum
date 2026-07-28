"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";

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

export function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  editable = true,
  minHeight = 260,
  ariaLabel = "Code editor",
  focusLine,
}: {
  value: string;
  onChange: (value: string) => void;
  language: string;
  placeholder?: string;
  editable?: boolean;
  minHeight?: number;
  ariaLabel?: string;
  focusLine?: number;
}) {
  const [mod, setMod] = useState<CodeMirrorModule | null>(null);
  const viewRef = useRef<{ state: { doc: { lines: number; line: (line: number) => { from: number } } }; dispatch: (value: unknown) => void; focus: () => void } | undefined>(undefined);

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
    return (
      <textarea
        className="code-editor-fallback"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        aria-label={ariaLabel}
        readOnly={!editable}
        style={{ minHeight }}
      />
    );
  }

  const CM = mod.CM;
  return (
    <div className="code-editor-shell">
      <CM
        value={value}
        onChange={onChange}
        editable={editable}
        placeholder={placeholder}
        extensions={extensions}
        // CodeMirror gives `.cm-content` role="textbox"; a label on the wrapper
        // does not reach it, so the name has to be set on the editable element.
        onCreateEditor={(view: typeof viewRef.current) => {
          viewRef.current = view;
          (view as { contentDOM?: HTMLElement } | undefined)?.contentDOM?.setAttribute("aria-label", ariaLabel);
        }}
        minHeight={`${minHeight}px`}
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
    </div>
  );
}
