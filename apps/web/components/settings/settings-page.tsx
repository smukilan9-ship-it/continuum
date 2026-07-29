"use client";

import type { AuthUser } from "@continuum/db";
import { Database, Link2, Lock, Palette, ShieldCheck, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ComponentType } from "react";

import { Banner, LoadingState, Tabs } from "@/components/ui";
import { PageHeader } from "@/components/workspace/page-header";

import { AccountSegment } from "./segments/account-segment";
import { useSettingsProfile } from "./use-settings-profile";

import "./settings.css";

type Toast = (message: string | null) => void;

export const SETTINGS_SEGMENTS = ["account", "appearance", "ai", "connections", "privacy", "security", "data", "advanced"] as const;
export type SettingsSegment = (typeof SETTINGS_SEGMENTS)[number];

const SEGMENT_META: Record<SettingsSegment, { label: string; icon: ComponentType<{ size?: number }>; blurb: string }> = {
  account: { label: "Account", icon: UserRound, blurb: "Your name, email, and how Continuum addresses you." },
  appearance: { label: "Appearance", icon: Palette, blurb: "Theme and how tightly lists are packed." },
  ai: { label: "AI", icon: Sparkles, blurb: "How Continuum picks a model, your own key, and local AI." },
  connections: { label: "Connections", icon: Link2, blurb: "Claude, your reading, your notes, and your own keys." },
  privacy: { label: "Privacy", icon: Lock, blurb: "What the assistant may use, and what Continuum keeps." },
  security: { label: "Security", icon: ShieldCheck, blurb: "Password and the devices you are signed in on." },
  data: { label: "Data", icon: Database, blurb: "Take everything with you, or delete the account." },
  advanced: { label: "Advanced", icon: SlidersHorizontal, blurb: "Connector address, model availability, diagnostics." },
};

/**
 * The heavier segments load on demand. Settings is reached from the sidebar on
 * every screen, so shipping the deletion flow, the provider probe, and the whole
 * Connections page to a user who opened Appearance would be the same mistake the
 * single-page Account screen made — everything present, nothing sought.
 */
const segmentLoading = () => <LoadingState rows={4} label="Loading this section" />;
const AppearanceSegment = dynamic(() => import("./segments/appearance-segment").then((module) => module.AppearanceSegment), { loading: segmentLoading });
const AiSegment = dynamic(() => import("./segments/ai-segment").then((module) => module.AiSegment), { loading: segmentLoading });
const PrivacySegment = dynamic(() => import("./segments/privacy-segment").then((module) => module.PrivacySegment), { loading: segmentLoading });
const SecuritySegment = dynamic(() => import("./segments/security-segment").then((module) => module.SecuritySegment), { loading: segmentLoading });
const DataSegment = dynamic(() => import("./segments/data-segment").then((module) => module.DataSegment), { loading: segmentLoading });
const AdvancedSegment = dynamic(() => import("./segments/advanced-segment").then((module) => module.AdvancedSegment), { loading: segmentLoading });
const ConnectionsSettings = dynamic(() => import("./connections-settings").then((module) => module.ConnectionsSettings), { loading: segmentLoading });

function segmentFromPath(pathname: string): SettingsSegment {
  const last = pathname.split("/").filter(Boolean)[1];
  return (SETTINGS_SEGMENTS as readonly string[]).includes(last ?? "") ? last as SettingsSegment : "account";
}

/**
 * Settings, split into the eight segments of §9.11.
 *
 * One page used to carry identity, password, sessions, the data export and
 * account deletion together (S9), so the control that ends your account sat a
 * scroll below the control that changes your display name. Each concern is now
 * its own destination with its own URL, and the destructive ones are somewhere
 * you have to mean to go.
 */
export function SettingsPage({ user, showToast }: { user: AuthUser; showToast: Toast }) {
  // The address is the source of truth for which section is open, so Back,
  // Forward, a bookmark, and the sidebar's own "/account" push all agree — and
  // it is right on the server render, so nothing flashes the wrong section.
  const pathname = usePathname();
  const [segment, setSegment] = useState<SettingsSegment>(() => segmentFromPath(pathname));
  useEffect(() => { setSegment(segmentFromPath(pathname)); }, [pathname]);

  const { profile, error, saving, save } = useSettingsProfile(showToast);

  const choose = useCallback((next: SettingsSegment) => {
    setSegment(next);
    const path = next === "account" ? "/account" : `/account/${next}`;
    if (window.location.pathname !== path) window.history.pushState({ settings: next }, "", path);
  }, []);

  const meta = SEGMENT_META[segment];

  return (
    <div className="screen settings-screen">
      <PageHeader title="Settings" description="Everything about your account, what Continuum may use, and what happens to your work." />

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SETTINGS_SEGMENTS.map((value) => {
            const Icon = SEGMENT_META[value].icon;
            const active = value === segment;
            return (
              <button
                key={value}
                type="button"
                className={active ? "settings-nav-item active" : "settings-nav-item"}
                aria-current={active ? "page" : undefined}
                onClick={() => choose(value)}
              >
                <Icon size={16} />
                <span>{SEGMENT_META[value].label}</span>
              </button>
            );
          })}
        </nav>

        {/* Below the sidebar breakpoint the same eight destinations become a
            scrollable tab strip rather than a 200px column eating half the
            screen. */}
        <div className="settings-nav-compact">
          <Tabs
            label="Settings sections"
            value={segment}
            onChange={choose}
            options={SETTINGS_SEGMENTS.map((value) => ({ value, label: SEGMENT_META[value].label }))}
          />
        </div>

        <div className="settings-content">
          <header className="settings-content-head">
            <h2>{meta.label}</h2>
            <p>{meta.blurb}</p>
          </header>

          {segment === "account" ? (
            <>
              {error ? <Banner tone="warning" title="Some details could not be loaded">{error}</Banner> : null}
              <AccountSegment user={user} profile={profile} saving={saving} onSave={save} showToast={showToast} />
            </>
          ) : null}
          {segment === "appearance" ? <AppearanceSegment /> : null}
          {segment === "ai" ? <AiSegment showToast={showToast} /> : null}
          {segment === "connections" ? <ConnectionsSettings showToast={showToast} embedded /> : null}
          {segment === "privacy" ? <PrivacySegment profile={profile} error={error} onSave={save} /> : null}
          {segment === "security" ? <SecuritySegment showToast={showToast} /> : null}
          {segment === "data" ? <DataSegment /> : null}
          {segment === "advanced" ? <AdvancedSegment showToast={showToast} /> : null}
        </div>
      </div>
    </div>
  );
}
