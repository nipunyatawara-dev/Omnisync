"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "@/lib/profiles";

interface WorkspaceGitSettingsViewProps {
  profile: UserProfile;
  onProfileUpdated: (updated: UserProfile) => void;
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  padding: "20px",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  textTransform: "uppercase",
  color: "var(--color-fg-muted)",
  margin: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
};

const hintStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--color-fg-muted)",
};

export default function WorkspaceGitSettingsView({
  profile,
  onProfileUpdated,
}: WorkspaceGitSettingsViewProps) {
  const [gitAuthorName, setGitAuthorName] = useState("");
  const [gitAuthorEmail, setGitAuthorEmail] = useState("");
  const [autoFetch, setAutoFetch] = useState(profile.autoFetch ?? true);
  const [branchProtection, setBranchProtection] = useState(profile.branchProtection ?? true);
  const [protectedBranchesText, setProtectedBranchesText] = useState(
    (profile.protectedBranches ?? []).join(", ")
  );
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const profileQuery = `profileId=${encodeURIComponent(profile.id)}`;
      const [diagRes, statusRes] = await Promise.all([
        fetch(`/api/workspace/diagnostics?${profileQuery}`),
        fetch(`/api/workspace/git?action=status&${profileQuery}`),
      ]);

      if (diagRes.ok) {
        const data = await diagRes.json();
        setGitAuthorName(data.gitAuthorName || "");
        setGitAuthorEmail(data.gitAuthorEmail || "");
        setCurrentBranch(data.currentBranch || null);
      }

      if (statusRes.ok) {
        const data = await statusRes.json();
        if (typeof data.branch === "string" && data.branch) {
          setCurrentBranch(data.branch);
        } else if (typeof data.current === "string" && data.current) {
          setCurrentBranch(data.current);
        }
      }
    } catch {
      // Form remains editable with profile defaults.
    } finally {
      setIsLoading(false);
    }
  }, [profile.id]);

  useEffect(() => {
    setAutoFetch(profile.autoFetch ?? true);
    setBranchProtection(profile.branchProtection ?? true);
    setProtectedBranchesText((profile.protectedBranches ?? []).join(", "));
    setMessage(null);
    load();
  }, [profile, load]);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const profileRes = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: profile.id,
          updates: {
            autoFetch,
            branchProtection,
            protectedBranches: protectedBranchesText
              .split(",")
              .map((b) => b.trim())
              .filter(Boolean),
          },
        }),
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok || !profileData.success || !profileData.profile) {
        setMessage({
          type: "error",
          text: profileData.error || "Failed to save workspace git settings.",
        });
        return;
      }

      const identityRes = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-identity",
          profileId: profile.id,
          name: gitAuthorName,
          email: gitAuthorEmail,
        }),
      });
      const identityData = await identityRes.json();
      if (!identityRes.ok) {
        setMessage({
          type: "error",
          text: identityData.error || "Workspace saved, but git identity update failed.",
        });
        onProfileUpdated(profileData.profile);
        return;
      }

      onProfileUpdated(profileData.profile);
      setMessage({ type: "success", text: "Workspace git settings saved." });
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage({ type: "error", text: `Error saving git settings: ${msg}` });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: "32px", color: "var(--color-fg-muted)", fontSize: "13px" }}>
        Loading workspace git settings…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {message && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "6px",
            fontSize: "13px",
            backgroundColor: message.type === "success" ? "var(--color-success-bg)" : "var(--color-danger-bg)",
            color: message.type === "success" ? "var(--color-success-fg)" : "var(--color-danger-fg)",
            border: `1px solid ${message.type === "success" ? "var(--color-success-border)" : "var(--color-danger-border)"}`,
          }}
        >
          {message.text}
        </div>
      )}

      <div className="card" style={cardStyle}>
        <h3 style={sectionTitleStyle}>Git Identity</h3>
        <p style={{ ...hintStyle, margin: 0 }}>
          Author used for commits in this workspace repository
          {currentBranch ? (
            <>
              {" "}
              (currently on <code style={{ fontFamily: "var(--font-mono)" }}>{currentBranch}</code>).
            </>
          ) : (
            "."
          )}{" "}
          Loaded from this repo&apos;s git config.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={labelStyle} htmlFor="workspace-git-username">
              Author name
            </label>
            <input
              id="workspace-git-username"
              type="text"
              className="form-control"
              value={gitAuthorName}
              onChange={(e) => setGitAuthorName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={labelStyle} htmlFor="workspace-git-email">
              Author email
            </label>
            <input
              id="workspace-git-email"
              type="email"
              className="form-control"
              value={gitAuthorEmail}
              onChange={(e) => setGitAuthorEmail(e.target.value)}
              placeholder="john@example.com"
            />
          </div>
        </div>
      </div>

      <div className="card" style={cardStyle}>
        <h3 style={sectionTitleStyle}>Sync Behavior</h3>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>Auto-fetch</div>
            <div style={hintStyle}>
              Allow background fetches for this workspace (interval is set in global Settings on the
              workspace selection page).
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoFetch}
            onChange={(e) => setAutoFetch(e.target.checked)}
            style={{ width: "16px", height: "16px", marginTop: "2px", flexShrink: 0 }}
          />
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>Branch protection</div>
            <div style={hintStyle}>
              Block direct commits on protected branches for this workspace.
            </div>
          </div>
          <input
            type="checkbox"
            checked={branchProtection}
            onChange={(e) => setBranchProtection(e.target.checked)}
            style={{ width: "16px", height: "16px", marginTop: "2px", flexShrink: 0 }}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={labelStyle} htmlFor="workspace-protected-branches">
            Protected branches
          </label>
          <input
            id="workspace-protected-branches"
            type="text"
            className="form-control"
            style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
            value={protectedBranchesText}
            onChange={(e) => setProtectedBranchesText(e.target.value)}
            placeholder="main, master"
            disabled={!branchProtection}
          />
          <span style={hintStyle}>Comma-separated branch names. main and master are always included.</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-primary" disabled={isSaving} onClick={handleSave}>
          {isSaving ? "Saving…" : "Save Git Settings"}
        </button>
      </div>
    </div>
  );
}
