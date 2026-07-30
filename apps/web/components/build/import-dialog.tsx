"use client";

import { Download, FileCode2, FileUp } from "lucide-react";
import { useState } from "react";

import { Button, Modal } from "@/components/ui";
import { CODE_FILE_ACCEPT, downloadSource, validateCodeFile, validateCodeSourceText } from "@/lib/code-file";
import { normalizeRunnableLanguage } from "@/lib/code-execution";
import { languageLabel } from "@/lib/labels";

import { languageExtension } from "./language";
import type { BuildFile } from "./types";

export type UploadedFile = { name: string; size: number; source: string; language: string; runnable: boolean };

/**
 * Local workflow instructions, per language (redesign.md §14.3, feature #80).
 *
 * These used to be a Python-only "Open in IDLE" section rendered inline on the
 * screen for everyone. They now live inside this dialog and only appear for the
 * language actually in the editor.
 */
const LOCAL_WORKFLOW: Record<string, { title: string; steps: string[] }> = {
  python: { title: "Open your current code in Python IDLE", steps: ["Download the Python file.", "Open IDLE on your computer.", "Select File → Open and choose the downloaded file.", "Select Run → Run Module.", "Return here and paste an error or upload the edited file if you want help."] },
  javascript: { title: "Run your current code with Node.js", steps: ["Download the JavaScript file.", "Install Node.js if you do not have it.", "Open a terminal in the folder you saved to.", "Run node your-file.js.", "Return here and paste an error if you want help."] },
  typescript: { title: "Run your current code with Node.js", steps: ["Download the TypeScript file.", "Install Node.js and the TypeScript compiler.", "Open a terminal in the folder you saved to.", "Run npx tsx your-file.ts, or compile with tsc first.", "Return here and paste an error if you want help."] },
  sql: { title: "Open your current query in the sqlite3 shell", steps: ["Download the SQL file.", "Install the sqlite3 command-line tool.", "Open a terminal in the folder you saved to.", "Run sqlite3 study.db < your-file.sql.", "Return here and paste an error if you want help."] },
  java: { title: "Compile and run your current code locally", steps: ["Download the Java file.", "Install a JDK.", "Open a terminal in the folder you saved to.", "Run javac YourFile.java then java YourFile.", "Return here and paste an error if you want help."] },
  c: { title: "Compile and run your current code locally", steps: ["Download the C file.", "Install a C compiler such as gcc or clang.", "Open a terminal in the folder you saved to.", "Run gcc your-file.c -o program then ./program.", "Return here and paste an error if you want help."] },
  "c++": { title: "Compile and run your current code locally", steps: ["Download the C++ file.", "Install a C++ compiler such as g++ or clang++.", "Open a terminal in the folder you saved to.", "Run g++ your-file.cpp -o program then ./program.", "Return here and paste an error if you want help."] },
  rust: { title: "Compile and run your current code locally", steps: ["Download the Rust file.", "Install the Rust toolchain with rustup.", "Open a terminal in the folder you saved to.", "Run rustc your-file.rs then ./your-file.", "Return here and paste an error if you want help."] },
};

/**
 * File and ZIP import. The safety checks are retained verbatim (§14.3): an
 * archive may not escape its own directory, carry a symlink, or expand past
 * 1.5 MB of text, and nothing an import produces is ever executed without a
 * second, explicit action.
 */
export function ImportDialog({
  open,
  onOpenChange,
  language,
  fileName,
  code,
  existingFiles,
  onImportProject,
  onUseFile,
  onRunFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: string;
  fileName: string;
  code: string;
  existingFiles: BuildFile[];
  onImportProject: (files: BuildFile[]) => void;
  onUseFile: (file: UploadedFile) => void;
  onRunFile: (file: UploadedFile, checkSyntax: boolean) => void;
}) {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile>();
  const [uploadError, setUploadError] = useState("");
  const workflow = LOCAL_WORKFLOW[language.toLowerCase()];

  async function selectCodeFile(file: File | undefined) {
    setUploadError("");
    setUploadedFile(undefined);
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".zip")) {
      if (file.size > 5 * 1024 * 1024) { setUploadError("Project archives are limited to 5 MB."); return; }
      try {
        const JSZip = (await import("jszip")).default;
        const archive = await JSZip.loadAsync(file, { checkCRC32: true, createFolders: false });
        const entries = Object.values(archive.files).filter((entry) => !entry.dir && !entry.name.startsWith("__MACOSX/"));
        if (!entries.length || entries.length > 24) throw new Error("A project archive must contain between 1 and 24 files.");
        const supported = /\.(py|js|jsx|ts|tsx|sql|java|c|cc|cpp|h|hpp|rs|go|rb|php|swift|kt|kts|html|css|scss|json|md|txt)$/i;
        const imported: BuildFile[] = [];
        let total = 0;
        for (const entry of entries) {
          const normalized = entry.name.normalize("NFKC").replaceAll("\\", "/");
          const permissions = typeof entry.unixPermissions === "number" ? entry.unixPermissions : 0;
          if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..") || (permissions & 0o170000) === 0o120000) throw new Error("The archive contains an unsafe path or symbolic link.");
          if (!supported.test(normalized)) continue;
          const bytes = await entry.async("uint8array");
          total += bytes.byteLength;
          if (bytes.byteLength > 200_000 || total > 1_500_000) throw new Error("Extracted project text exceeds the safe 1.5 MB limit.");
          const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          const extension = normalized.split(".").at(-1)?.toLowerCase();
          const detected = extension === "py" ? "python" : extension === "js" || extension === "jsx" ? "javascript" : extension === "ts" || extension === "tsx" ? "typescript" : extension === "sql" ? "sql" : extension ?? "text";
          imported.push({ id: `file_${crypto.randomUUID()}`, name: normalized, language: detected, content });
        }
        if (!imported.length) throw new Error("No supported plain-text code files were found in the archive.");
        onImportProject(imported);
        setUploadedFile(undefined);
      } catch (cause) {
        setUploadError(cause instanceof Error ? cause.message : "The project archive could not be opened safely.");
      }
      return;
    }
    const validation = validateCodeFile(file);
    if (!validation.ok) { setUploadError(validation.error); return; }
    try {
      const source = await file.text();
      const contentError = validateCodeSourceText(source);
      if (contentError) { setUploadError(contentError); return; }
      setUploadedFile({ name: validation.name, size: validation.size, source, language: validation.language, runnable: validation.runnable });
    } catch {
      setUploadError("Continuum could not read this file as plain text. Save it as UTF-8 and try again.");
    }
  }

  function close(next: boolean) {
    if (!next) { setUploadedFile(undefined); setUploadError(""); }
    onOpenChange(next);
  }

  const importedRuntime = uploadedFile ? normalizeRunnableLanguage(uploadedFile.language) : undefined;

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Import a code file from your computer"
      description="Open source code in the editor first. Continuum never runs an imported file or sends it to AI without a separate action."
      dirty={Boolean(uploadedFile)}
      dirtyMessage="Close this window? The selected file has not been added to the editor."
      footer={<>
        <Button variant="secondary" onClick={() => close(false)}>Cancel</Button>
        {uploadedFile ? <Button variant="primary" onClick={() => { onUseFile(uploadedFile); setUploadedFile(undefined); }}>View code in editor</Button> : null}
      </>}
    >
      <div className="build-import">
        <section>
          <h3>Use a file here</h3>
          <label className="build-file-drop">
            <FileUp size={22} aria-hidden="true" />
            <span>
              <strong>Choose a code file or safe project archive</strong>
              <small>Supported plain-text code · 1 MB per file · ZIP projects up to 5 MB</small>
            </span>
            <input type="file" accept={`${CODE_FILE_ACCEPT},.zip,application/zip`} onChange={(event) => void selectCodeFile(event.target.files?.[0])} />
          </label>
          {uploadError ? <p className="build-inline-error" role="alert">{uploadError}</p> : null}
          {uploadedFile ? (
            <div className="build-selected-file">
              <FileCode2 size={19} aria-hidden="true" />
              <div>
                <strong>{uploadedFile.name}</strong>
                <span>{Math.max(1, Math.round(uploadedFile.size / 1024))} KB · {languageLabel(uploadedFile.language)}</span>
              </div>
              <div>
                {uploadedFile.language === "python" ? <Button variant="secondary" size="sm" onClick={() => { onRunFile(uploadedFile, true); setUploadedFile(undefined); }}>Check syntax</Button> : null}
                {importedRuntime && uploadedFile.source.length <= 200_000 ? <Button variant="primary" size="sm" onClick={() => { onRunFile(uploadedFile, false); setUploadedFile(undefined); }}>Run safely</Button> : null}
              </div>
            </div>
          ) : null}
          {uploadedFile && !uploadedFile.runnable ? <p className="build-privacy-note">This language can be viewed, edited, downloaded, and discussed with AI. A safe local runtime is not available in Continuum yet, so no Run button is shown.</p> : null}
          {uploadedFile && uploadedFile.runnable && uploadedFile.source.length > 200_000 ? <p className="build-privacy-note">This file can be edited here, but it is too large for the browser runner. Trim it below 200,000 characters before running.</p> : null}
        </section>

        {workflow ? (
          <section>
            <h3>{workflow.title}</h3>
            <ol>{workflow.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            <Button variant="secondary" size="sm" onClick={() => downloadSource(fileName, code, languageExtension(language))}>
              <Download size={15} aria-hidden="true" />Download {fileName || `${languageLabel(language)} file`}
            </Button>
          </section>
        ) : null}

        <p className="build-privacy-note">
          The 1 MB import limit keeps the editor responsive. Added files persist in your account-scoped Continuum workspace and are sent to AI only when you explicitly request help.
          {existingFiles.length > 1 ? ` This workspace currently holds ${existingFiles.length} files.` : ""}
        </p>
      </div>
    </Modal>
  );
}
