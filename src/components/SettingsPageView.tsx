"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import GlobalSettingsView from "@/components/GlobalSettingsView";
import WorkspaceSettingsView from "@/components/WorkspaceSettingsView";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { UserProfile } from "@/lib/profiles";

export type SettingsTab = "general" | "git" | "workspace";

interface SettingsPageViewProps {
  mode?: "page" | "embedded";
  defaultTab?: SettingsTab;
  returnTo?: string;
  activeProfile?: UserProfile | null;
  onProfileUpdated?: (updated: UserProfile) => void;
}

const TABS: { id: SettingsTab; label: string; requiresProfile?: boolean }[] = [
  { id: "general", label: "General" },
  { id: "git", label: "Git" },
  { id: "workspace", label: "Workspace", requiresProfile: true },
];

export default function SettingsPageView({
  mode = "embedded",
  defaultTab = "general",
  returnTo,
  activeProfile = null,
  onProfileUpdated,
}: SettingsPageViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);
  const globalSettings = useGlobalSettings();

  const visibleTabs = TABS.filter((tab) => !tab.requiresProfile || activeProfile);

  const handleBack = () => {
    if (returnTo) {
      router.push(returnTo);
    } else if (mode === "page") {
      router.push(activeProfile ? "/" : "/setup");
    }
  };

  return (
    <div
      className="animate-fade-slide"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: mode === "embedded" ? "100%" : "100vh",
        overflow: "hidden",
        backgroundColor: "var(--color-bg-default)",
      }}
    >
      {mode === "page" && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid var(--color-border-default)",
            backgroundColor: "var(--color-bg-subtle)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleBack}
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                arrow_back
              </span>
              Back
            </button>
            <div>
              <h1
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--color-fg-default)",
                }}
              >
                Settings
              </h1>
              <p style={{ fontSize: "11px", color: "var(--color-fg-muted)", margin: "2px 0 0 0" }}>
                Global preferences and workspace configuration
              </p>
            </div>
          </div>
          <img
            src="/icon.png"
            alt="OmniSync"
            style={{ height: "24px", width: "24px", objectFit: "contain", borderRadius: "4px" }}
          />
        </header>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <nav
          style={{
            width: mode === "embedded" ? "200px" : "220px",
            borderRight: "1px solid var(--color-border-default)",
            backgroundColor: "var(--color-bg-subtle)",
            padding: "16px 12px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flexShrink: 0,
            overflowY: "auto",
          }}
        >
          {mode === "embedded" && (
            <div style={{ padding: "0 8px 12px", borderBottom: "1px solid var(--color-border-default)", marginBottom: "8px" }}>
              <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--color-fg-default)" }}>
                Settings
              </h2>
              <p style={{ fontSize: "11px", color: "var(--color-fg-muted)", margin: "4px 0 0 0" }}>
                App &amp; workspace preferences
              </p>
            </div>
          )}

          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: activeTab === tab.id ? "var(--color-bg-active)" : "transparent",
                border: "none",
                color: activeTab === tab.id ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                fontWeight: activeTab === tab.id ? 600 : 500,
                fontSize: "13px",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                transition: "background 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: mode === "embedded" ? "24px 32px" : "32px 40px",
          }}
        >
          <div style={{ maxWidth: "720px", margin: "0 auto", width: "100%" }}>
            {(activeTab === "general" || activeTab === "git") && (
              <>
                <div style={{ marginBottom: "24px" }}>
                  <h2
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      letterSpacing: "-0.5px",
                      margin: 0,
                      color: "var(--color-fg-default)",
                    }}
                  >
                    {activeTab === "general" ? "General" : "Git Configuration"}
                  </h2>
                  <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginTop: "4px" }}>
                    {activeTab === "general"
                      ? "System preferences that apply across all workspaces."
                      : "Default git identity and sync behavior for every workspace."}
                  </p>
                </div>

                <GlobalSettingsView
                  settings={globalSettings.settings}
                  isLoading={globalSettings.isLoading}
                  isSaving={globalSettings.isSaving}
                  message={globalSettings.message}
                  onUpdate={globalSettings.updateField}
                  onSave={globalSettings.save}
                  section={activeTab}
                />
              </>
            )}

            {activeTab === "workspace" && activeProfile && onProfileUpdated && (
              <WorkspaceSettingsView
                activeProfile={activeProfile}
                onProfileUpdated={onProfileUpdated}
                embedded
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
