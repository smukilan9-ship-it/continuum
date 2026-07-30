"use client";

import { Copy, Edit3, FileCode2, FilePlus2, MoreHorizontal, Trash2 } from "lucide-react";

import { Button, IconButton, Menu, Select } from "@/components/ui";
import { languageLabel } from "@/lib/labels";

import type { BuildFile } from "./types";

/**
 * The file list (redesign.md §14.3).
 *
 * One buffer per language: switching language used to keep whatever source was
 * in the editor and change the runtime with it, so `while True: pass` switched
 * to SQL produced `near "while": syntax error`. Each language owns its own file
 * and the rail shows which buffers exist.
 *
 * Between 900 and 1100px the rail collapses to a dropdown (§14.3 Responsive)
 * rather than eating a column the editor needs.
 */
export function FileRail({
  files,
  activeFileId,
  variant,
  onActivate,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
}: {
  files: BuildFile[];
  activeFileId: string;
  variant: "rail" | "dropdown";
  onActivate: (fileId: string) => void;
  onCreate: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const actions = [
    { label: "Rename file", onSelect: onRename, icon: <Edit3 size={14} /> },
    { label: "Duplicate file", onSelect: onDuplicate, icon: <Copy size={14} /> },
    { label: "New file", onSelect: onCreate, icon: <FilePlus2 size={14} /> },
    { label: "Delete file", onSelect: onDelete, icon: <Trash2 size={14} />, destructive: true },
  ];

  if (variant === "dropdown") {
    return (
      <div className="build-file-dropdown">
        <label className="build-file-picker">
          <span className="sr-only">Open file</span>
          <Select aria-label="Open file" value={activeFileId} onChange={(event) => onActivate(event.target.value)}>
            {files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
          </Select>
        </label>
        <Menu
          label="File actions"
          items={actions}
          trigger={<IconButton label="File actions" size={32}><MoreHorizontal size={16} /></IconButton>}
        />
      </div>
    );
  }

  return (
    <aside className="build-rail" aria-label="Files">
      <div className="build-rail-head">
        <h2>Files</h2>
        <IconButton label="New file" size={28} onClick={onCreate}><FilePlus2 size={15} /></IconButton>
      </div>

      <ul className="build-rail-list">
        {files.map((file) => {
          const active = file.id === activeFileId;
          return (
            <li key={file.id}>
              <button
                type="button"
                className={active ? "build-rail-file build-rail-file-active" : "build-rail-file"}
                aria-current={active ? "true" : undefined}
                onClick={() => onActivate(file.id)}
                title={`${file.name} · ${languageLabel(file.language)}`}
              >
                <FileCode2 size={13} aria-hidden="true" />
                <span>{file.name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="build-rail-foot">
        <Menu
          label="File actions"
          align="start"
          items={actions}
          trigger={<Button variant="quiet" size="sm" className="build-rail-actions"><MoreHorizontal size={15} aria-hidden="true" />File actions</Button>}
        />
      </div>
    </aside>
  );
}
