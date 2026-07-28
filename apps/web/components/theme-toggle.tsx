"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const options: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

function resolveTheme(preference: ThemePreference) {
  return preference === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : preference;
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

/**
 * An explicit three-state control rather than a cycling button.
 *
 * The cycle ran system → light → dark, so the first click from "system" on an
 * OS already set to light produced no visible change at all — the control looked
 * broken. Each state is now its own target, and the icon shows the resolved
 * theme, not the preference name.
 */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("continuum-theme");
    const next = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    setPreference(next);
    setResolved(resolveTheme(next));
    applyTheme(next);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if ((window.localStorage.getItem("continuum-theme") ?? "system") !== "system") return;
      applyTheme("system");
      setResolved(resolveTheme("system"));
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  function choose(next: ThemePreference) {
    setPreference(next);
    window.localStorage.setItem("continuum-theme", next);
    applyTheme(next);
    setResolved(resolveTheme(next));
  }

  return (
    <div className="theme-toggle" role="radiogroup" aria-label={`Colour theme, currently showing ${resolved}`}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={active ? "active" : ""}
            onClick={() => choose(option.value)}
            title={option.value === "system" ? `Follow the system theme (currently ${resolved})` : `${option.label} theme`}
          >
            <Icon size={15} aria-hidden="true" />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
