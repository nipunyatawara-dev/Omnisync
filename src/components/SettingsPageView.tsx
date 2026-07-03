"use client";

import { useCallback, useEffect, useState } from "react";
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
  /** Called when the currently active workspace profile is updated (dashboard sync). */
  onActiveProfileUpdated?: (updated: UserProfile) => void;
  /** Called when the active workspace is deleted from settings. */
  onActiveProfileDeleted?: () => void;
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "git", label: "Git" },
  { id: "workspace", label: "Workspaces" },
];

function workspaceLabel(profile: UserProfile): string {
  return profile.name || profile.workspacePath?.split("/").pop() || "Untitled workspace";
}

export default function SettingsPageView({
  mode = "embedded",
  defaultTab = "general",
  returnTo,
  onActiveProfileUpdated,
  onActiveProfileDeleted,
}: SettingsPageViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);
  const globalSettings = useGlobalSettings();

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);

  const loadProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/profiles");
      const data = await res.json();
      const list = (data.profiles || []) as UserProfile[];
      const activeId = (data.activeProfileId as string | null) ?? null;
      setProfiles(list);
      setActiveProfileId(activeId);
      setSelectedWorkspaceId((current) => {
        if (current && list.some((p) => p.id === current)) return current;
        if (activeId && list.some((p) => p.id === activeId)) return activeId;
        return list[0]?.id ?? null;
      });
    } catch {
      setProfiles([]);
      setActiveProfileId(null);
      setSelectedWorkspaceId(null);
    } finally {
      setIsLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const selectedProfile = profiles.find((p) => p.id === selectedWorkspaceId) ?? null;

  const handleProfileUpdated = (updated: UserProfile) => {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (updated.id === activeProfileId) {
      onActiveProfileUpdated?.(updated);
    }
  };

  const handleProfileDeleted = (deletedId: string) => {
    const remaining = profiles.filter((p) => p.id !== deletedId);
    setProfiles(remaining);
    if (selectedWorkspaceId === deletedId) {
      const nextId =
        remaining.find((p) => p.id === activeProfileId)?.id ?? remaining[0]?.id ?? null;
      setSelectedWorkspaceId(nextId);
    }
    if (deletedId === activeProfileId) {
      setActiveProfileId(remaining[0]?.id ?? null);
      onActiveProfileDeleted?.();
    }
  };

  const handleBack = () => {
    if (returnTo) {
      router.push(returnTo);
    } else if (mode === "page") {
      router.push(activeProfileId ? "/" : "/setup");
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
                App preferences and per-workspace configuration
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

          {TABS.map((tab) => (
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
          <div
            style={{
              maxWidth: activeTab === "workspace" ? "960px" : "720px",
              margin: "0 auto",
              width: "100%",
            }}
          >
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

            {activeTab === "workspace" && (
              <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                <aside
                  style={{
                    width: "220px",
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    position: "sticky",
                    top: 0,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        fontSize: "20px",
                        fontWeight: 700,
                        letterSpacing: "-0.5px",
                        margin: 0,
                        color: "var(--color-fg-default)",
                      }}
                    >
                      Workspaces
                    </h2>
                    <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginTop: "4px" }}>
                      Select a workspace to edit its settings.
                    </p>
                  </div>

                  {isLoadingProfiles ? (
                    <p style={{ fontSize: "12px", color: "var(--color-fg-muted)", padding: "8px" }}>
                      Loading workspaces…
                    </p>
                  ) : profiles.length === 0 ? (
                    <div
                      className="card"
                      style={{ padding: "16px", fontSize: "12px", color: "var(--color-fg-muted)", lineHeight: 1.5 }}
                    >
                      No workspaces yet.{" "}
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ marginTop: "8px", width: "100%" }}
                        onClick={() => router.push("/setup")}
                      >
                        Add workspace
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {profiles.map((profile) => {
                        const isSelected = profile.id === selectedWorkspaceId;
                        const isActive = profile.id === activeProfileId;
                        return (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => setSelectedWorkspaceId(profile.id)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "6px",
                              border: `1px solid ${isSelected ? "var(--color-accent-border, var(--color-border-default))" : "var(--color-border-default)"}`,
                              background: isSelected ? "var(--color-bg-active)" : "var(--color-bg-subtle)",
                              color: "var(--color-fg-default)",
                              cursor: "pointer",
                              textAlign: "left",
                              width: "100%",
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                            }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600 }}>
                              {workspaceLabel(profile)}
                              {isActive && (
                                <span
                                  style={{
                                    fontSize: "9px",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                    padding: "2px 5px",
                                    borderRadius: "4px",
                                    backgroundColor: "var(--color-success-bg)",
                                    color: "var(--color-success-fg)",
                                  }}
                                >
                                  Active
                                </span>
                              )}
                            </span>
                            {profile.workspacePath && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  color: "var(--color-fg-muted)",
                                  fontFamily: "var(--font-mono)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {profile.workspacePath}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </aside>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {selectedProfile ? (
                    <WorkspaceSettingsView
                      profile={selectedProfile}
                      isActive={selectedProfile.id === activeProfileId}
                      onProfileUpdated={handleProfileUpdated}
                      onProfileDeleted={handleProfileDeleted}
                      embedded
                    />
                  ) : (
                    !isLoadingProfiles &&
                    profiles.length > 0 && (
                      <p style={{ fontSize: "13px", color: "var(--color-fg-muted)" }}>
                        Select a workspace from the list to view and edit its settings.
                      </p>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
