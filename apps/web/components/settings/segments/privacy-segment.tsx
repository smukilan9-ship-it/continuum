"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Banner, Button, LoadingState, Switch } from "@/components/ui";

import { ASSISTANT_DEFAULT_COPY, ASSISTANT_DEFAULT_KEYS, type AssistantDefaults } from "../assistant-defaults";
import { SettingsSection } from "../section";
import type { SettingsProfile } from "../use-settings-profile";

export function PrivacySegment({
  profile,
  error,
  onSave,
}: {
  profile: SettingsProfile | undefined;
  error?: string;
  onSave: (patch: { assistantDefaults?: Partial<AssistantDefaults> }) => Promise<boolean>;
}) {
  return (
    <>
      <SettingsSection
        title="What the assistant may use by default"
        description="Turning one off does not delete anything — it means the assistant will not reach for it unless you say so in the message."
      >
        {error ? <Banner tone="warning" title="These settings could not be loaded">{error}</Banner> : null}
        {!profile && !error ? <LoadingState rows={4} label="Loading your privacy settings" /> : null}
        {profile ? (
          <div className="settings-switches">
            {ASSISTANT_DEFAULT_KEYS.map((key) => (
              <Switch
                key={key}
                label={ASSISTANT_DEFAULT_COPY[key].label}
                description={ASSISTANT_DEFAULT_COPY[key].description}
                checked={profile.assistantDefaults[key]}
                onCheckedChange={(next) => void onSave({ assistantDefaults: { [key]: next } })}
              />
            ))}
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="What Continuum keeps"
        description="Continuum keeps what is durable — goals, decisions, progress, and the sources behind them — not a transcript of every conversation."
      >
        <p className="settings-note">
          Anything it has learned about you is listed in Context, in your own words, with where it came from. You can remove any single item from there and it stops being used.
        </p>
        <div className="settings-form-actions">
          <Link className="button button-secondary" href="/memory">Open Context<ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </SettingsSection>

      <SettingsSection title="Connected clients" description="Anything you connected — Claude, a paired vault, a personal key — is listed with what it can reach.">
        <div className="settings-form-actions">
          <Button variant="secondary" onClick={() => window.location.assign("/integrations")}>Review connections</Button>
        </div>
      </SettingsSection>
    </>
  );
}
