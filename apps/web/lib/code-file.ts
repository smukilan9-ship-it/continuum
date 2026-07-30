import { normalizeRunnableLanguage } from "./code-execution";

export const CODE_FILE_LIMIT_BYTES = 1024 * 1024;

const extensionLanguages: Record<string, string> = {
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sql: "sql",
  java: "java",
  c: "c",
  h: "c",
  cc: "c++",
  cpp: "c++",
  cxx: "c++",
  hpp: "c++",
  rs: "rust",
};

export const CODE_FILE_ACCEPT = Object.keys(extensionLanguages).map((extension) => `.${extension}`).join(",");

export type CodeFileCheck =
  | { ok: true; name: string; size: number; language: string; runnable: boolean }
  | { ok: false; error: string };

function extensionOf(name: string) {
  return name.trim().toLowerCase().split(".").pop() ?? "";
}

export function languageForCodeFile(name: string) {
  return extensionLanguages[extensionOf(name)];
}

export function validateCodeFile(file: Pick<File, "name" | "size" | "type">): CodeFileCheck {
  const language = languageForCodeFile(file.name);
  if (!language) {
    return { ok: false, error: "Choose a Python, JavaScript, TypeScript, SQL, Java, C, C++, or Rust source file." };
  }
  if (file.size <= 0) return { ok: false, error: "This file is empty. Choose a source file containing code." };
  if (file.size > CODE_FILE_LIMIT_BYTES) {
    return { ok: false, error: `Source files are limited to ${CODE_FILE_LIMIT_BYTES / 1024 / 1024} MB so the browser editor remains responsive.` };
  }
  const reportedType = file.type.toLowerCase();
  const allowedApplicationTypes = new Set([
    "application/javascript",
    "application/json",
    "application/octet-stream",
    "application/sql",
    "application/typescript",
    "application/x-python",
    "application/x-python-code",
  ]);
  if (reportedType && !reportedType.startsWith("text/") && !allowedApplicationTypes.has(reportedType)) {
    return { ok: false, error: "The selected file does not look like a plain-text source file." };
  }
  return { ok: true, name: file.name, size: file.size, language, runnable: Boolean(normalizeRunnableLanguage(language)) };
}

export function validateCodeSourceText(value: string) {
  if (!value.trim()) return "This file contains no source code.";
  if (value.includes("\0") || value.includes("\uFFFD")) {
    return "This file is not valid UTF-8 plain text. Save it as a text source file and try again.";
  }
  return undefined;
}

export function safeSourceFileName(value: string, fallbackExtension = "txt") {
  const supplied = value.trim().split(/[\\/]/).pop() ?? "";
  const extension = extensionOf(supplied);
  const knownExtension = extensionLanguages[extension] ? extension : fallbackExtension.replace(/^\./, "");
  const withoutExtension = supplied.replace(/\.[^.]+$/, "");
  const stem = withoutExtension.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[._-]+/, "").slice(0, 80);
  return `${stem || "continuum_program"}.${knownExtension}`;
}

export function downloadSource(name: string, source: string, fallbackExtension = "txt") {
  const url = URL.createObjectURL(new Blob([source], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeSourceFileName(name, fallbackExtension);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
