# Code-learning UX

The **Code** workspace (`apps/web/components/workspace/code-screen.tsx`) is a
syllabus-aware coding coach: it sends the code model your level, goals, unfinished
work, and learning state, and coaches against that context.

## The session-reset defect (fixed)

**Symptom:** interacting with the Code screen — and especially navigating away and
back — discarded the learner's code, topic, prompt, and coach response. The screen
"reset."

**Root causes (two, both fixed):**

1. **No persistence + remount on navigation.** `WorkspaceScreens` renders each
   screen conditionally by view, so leaving Code and returning *unmounts and
   remounts* `CodeScreen`, wiping all local `useState`. There was no persistence.
2. **A suspending editor blocked effect commit.** The first editor attempt loaded
   CodeMirror via `next/dynamic({ ssr: false })`. While that chunk was loading, the
   `CodeScreen` subtree stayed suspended, which **deferred its passive effects** —
   including the very effect meant to restore the session. On a cold dev compile
   this could look like the restore never ran.

**Fixes:**

- **`useCodeSession` hook** (`components/workspace/use-code-session.ts`) persists the
  whole session — `goalId, topic, language, mode, provider, prompt, code, answer,
  attempts` — to `localStorage` (`continuum.code-session.v1.<userId>`) on every
  change, and restores it on mount via a `mergeSavedSession` merge (saved values win
  over defaults). This survives navigation, refresh, tab-switch, and errors. The pure
  merge/round-trip logic is unit-tested (`tests/code-session.test.ts`).
- **Decoupled editor** (`components/workspace/code-editor.tsx`) no longer uses
  `next/dynamic({ssr:false})`. It renders a real `<textarea>` immediately and loads
  CodeMirror from *its own* effect, swapping in when ready. The parent screen commits
  and its effects run right away; a failed editor load degrades to a usable textarea.
- **Interactions never clear work.** Choosing a coaching mode only sets mode+prompt;
  selecting a topic suggestion only sets the topic; submitting streams into a
  transient buffer and commits to the persisted session on completion — the editor's
  `code` is never touched by any of these.
- **Duplicate submissions are guarded** (`if (busy) return`) and a **Reset session**
  control requires an explicit inline confirmation before clearing.

**Verified live:** with a saved session in `localStorage`, loading `/code` restores
the exact topic, language, and code into the editor (confirmed by reading React state
via a data-attribute and the CodeMirror content), and the effect flushes once the
route's dev chunk finishes compiling.

## The editor (CodeMirror 6)

`CodeEditor` wraps CodeMirror 6 (`@uiw/react-codemirror` + `@codemirror/lang-*`):

- syntax highlighting for Python, SQL, JavaScript, TypeScript, Java, C/C++, Rust;
- line numbers, active-line highlight, bracket matching + auto-close;
- **Tab inserts indentation** (`indentWithTab`) — essential for Python;
- `indentOnInput`, undo/redo (CodeMirror history), line wrapping;
- a light theme matched to the app palette;
- a `<textarea>` fallback (dark, monospace, `tab-size: 4`) while CodeMirror loads or
  if it fails — so the screen is always usable, including on constrained mobile.

Language is a compact inline selector on the editor toolbar (not a always-open
dropdown block), and labels come from the central presentation layer (`SQL`, `C++`,
`Python & MySQL`, etc.).

## Attempt history

Each completed coach response is recorded as an attempt (topic, language, code,
answer, timestamp) in the persisted session and shown under a **History** tab. Any
attempt can be **restored into the editor** — comparing approaches never loses work.

## Layout

A two-column workspace: the controls + editor on the left, a `Coach` / `History`
tabbed panel on the right. Errors render as a structured, non-alarming block ("The
coach could not respond… Your code and topic are safe") rather than a wall of red.

## Tests

- `tests/code-session.test.ts` — default construction, restore-over-defaults,
  exact multiline/indented round-trip, attempt-history restore, corrupt-draft safety.
- `tests/labels.test.ts` — the presentation layer that supplies language/status
  labels used here.
