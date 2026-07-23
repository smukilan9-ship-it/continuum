"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const order: ThemePreference[] = ["system", "light", "dark"];

function applyTheme(preference: ThemePreference) {
  const resolved = preference === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem("continuum-theme");
    const next = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    setPreference(next);
    applyTheme(next);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => { if ((window.localStorage.getItem("continuum-theme") ?? "system") === "system") applyTheme("system"); };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Laptop;
  const nextPreference = order[(order.indexOf(preference) + 1) % order.length]!;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        setPreference(nextPreference);
        window.localStorage.setItem("continuum-theme", nextPreference);
        applyTheme(nextPreference);
      }}
      aria-label={`Theme: ${preference}. Switch to ${nextPreference}.`}
      title={`Theme: ${preference}`}
    >
      <Icon size={16} />
      <span>{preference}</span>
    </button>
  );
}
