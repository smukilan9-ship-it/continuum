export const PYTHON_FILE_LIMIT_BYTES = 256 * 1024;

export type PythonFileCheck =
  | { ok: true; name: string; size: number }
  | { ok: false; error: string };

export function validatePythonFile(file: Pick<File, "name" | "size" | "type">): PythonFileCheck {
  if (!file.name.toLowerCase().endsWith(".py")) {
    return { ok: false, error: "Choose a Python file ending in .py. Other file types are not accepted." };
  }
  if (file.size <= 0) return { ok: false, error: "This file is empty. Choose a .py file containing Python code." };
  if (file.size > PYTHON_FILE_LIMIT_BYTES) {
    return { ok: false, error: `Python files are limited to ${Math.round(PYTHON_FILE_LIMIT_BYTES / 1024)} KB.` };
  }
  // Browsers commonly report an ordinary .py file as octet-stream. The
  // extension, size and decoded-content checks remain authoritative.
  const reportedType = file.type.toLowerCase();
  const allowedApplicationTypes = new Set(["application/x-python", "application/x-python-code", "application/octet-stream"]);
  if (reportedType && !reportedType.startsWith("text/") && !allowedApplicationTypes.has(reportedType)) {
    return { ok: false, error: "The selected file does not look like a plain-text Python file." };
  }
  return { ok: true, name: file.name, size: file.size };
}

export function validatePythonSourceText(value: string) {
  if (!value.trim()) return "This file contains no Python code.";
  if (value.includes("\0") || value.includes("\uFFFD")) {
    return "This file is not valid UTF-8 plain text. Save it as a text .py file and try again.";
  }
  return undefined;
}

export function safePythonFileName(value: string) {
  const stem = value.trim().replace(/\.py$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[._-]+/, "").slice(0, 80);
  return `${stem || "continuum_program"}.py`;
}

export function downloadSource(name: string, source: string) {
  const url = URL.createObjectURL(new Blob([source], { type: "text/x-python;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safePythonFileName(name);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
