"use client";

import { useEffect, useState } from "react";

import { Tabs } from "@/components/ui";

import { SettingsSection } from "../section";

type Density = "comfortable" | "compact";

const DENSITY_KEY = "continuum-density";

function applyDensity(density: Density) {
  if (density === "compact") document.documentElement.dataset.density = "compact";
  else delete document.documentElement.dataset.density;
}

export function AppearanceSegment() {
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    const stored = window.localStorage.getItem(DENSITY_KEY);
    const next: Density = stored === "compact" ? "compact" : "comfortable";
    setDensity(next);
    applyDensity(next);
  }, []);

  function choose(next: Density) {
    setDensity(next);
    window.localStorage.setItem(DENSITY_KEY, next);
    applyDensity(next);
  }

  return (
    <>
      <SettingsSection title="Density" description="How much vertical room a list row takes. Compact fits more on a small screen.">
        <Tabs
          label="Row density"
          variant="segmented"
          value={density}
          onChange={choose}
          options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]}
        />
        {/* The choice applies immediately and is remembered in this browser.
            Applying it before first paint needs the boot script in app/layout.tsx,
            which this change does not own. */}
        <p className="settings-note">Applies to every list in Continuum, on this device.</p>
      </SettingsSection>
    </>
  );
}
