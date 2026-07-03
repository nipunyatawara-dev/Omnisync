"use client";

import { useCallback, useEffect, useState } from "react";
import { UserProfile } from "@/lib/profiles";

declare global {
  interface Window {
    electron?: {
      selectDirectory: () => Promise<string | null>;
    };
  }
}

interface WorkspaceSettingsViewProps {
  profile: UserProfile;
  isActive?: boolean;
  onProfileUpdated: (updated: UserProfile) => void;
  onProfileDeleted?: (deletedId: string) => void;
  embedded?: boolean;
}

interface WorkspaceDiagnostics {
  projectName: string;
  projectVersion: string;
  folderName: string;
  gitStatus: string;
  packageJsonExists: boolean;
  totalDependencies: number;
  missingDependencies: string[];
  currentBranch: string | null;
  remoteUrl: string | null;
  gitAuthorName?: string;
  gitAuthorEmail?: string;
  isNodeCompatible: boolean;
  nodeVersion: string;
  npmVersion: string;
}

interface SyncSnapshot {
  ahead: number;
  behind: number;
  upstream: string;
  branchProtected: boolean;
  autoFetchEnabled: boolean;
  autoFetchIntervalMinutes: number;
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
  letterSpacing: "0.02em",
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
};

const hintStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--color-fg-muted)",
  lineHeight: 1.5,
};

const RUN_PRESETS = ["npm run dev", "yarn dev", "pnpm dev", "next dev"];
const BUILD_PRESETS = ["npm run build", "yarn build", "pnpm build", "tsc --noEmit"];

function sanitizeRemoteUrl(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//");
}

function StatCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneColor =
    tone === "success"
      ? "var(--color-success-fg)"
      : tone === "warning"
        ? "var(--color-attention-fg, #d29922)"
        : tone === "danger"
          ? "var(--color-danger-fg)"
          : "var(--color-fg-default)";

  return (
    <div
      className="card"
      style={{
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "15px",
          fontWeight: 700,
          color: toneColor,
          fontFamily: label === "Branch" || label === "Sync" ? "var(--font-mono)" : undefined,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.35,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </span>
      {detail && (
        <span style={{ fontSize: "11px", color: "var(--color-fg-muted)", lineHeight: 1.4, overflowWrap: "anywhere" }}>
          {detail}
        </span>
      )}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
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
        <div style={{ fontSize: "13px", fontWeight: 600 }}>{title}</div>
        <div style={hintStyle}>{description}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: "16px", height: "16px", marginTop: "2px", flexShrink: 0 }}
      />
    </label>
  );
}

function PresetChips({ presets, onSelect }: { presets: string[]; onSelect: (value: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          className="btn btn-sm"
          onClick={() => onSelect(preset)}
          style={{ fontFamily: "var(--font-mono)", fontSize: "11px", padding: "4px 8px" }}
        >
          {preset}
        </button>
      ))}
    </div>
  );
}

export default function WorkspaceSettingsView({
  profile,
  isActive = false,
  onProfileUpdated,
  onProfileDeleted,
  embedded = false,
}: WorkspaceSettingsViewProps) {
  const [workspaceName, setWorkspaceName] = useState(profile.name || "");
  const [workspacePath, setWorkspacePath] = useState(profile.workspacePath || "");
  const workspaceType = profile.workspaceType || "manual";

  const [branchProtection, setBranchProtection] = useState<boolean>(profile.branchProtection ?? true);
  const [protectedBranchesText, setProtectedBranchesText] = useState<string>(
    (profile.protectedBranches ?? []).join(", ")
  );
  const [autoFetch, setAutoFetch] = useState<boolean>(profile.autoFetch ?? true);
  const [devPort, setDevPort] = useState<number>(profile.port ?? 3000);
  const [runCommand, setRunCommand] = useState<string>(profile.runCommand ?? "npm run dev");
  const [buildCommand, setBuildCommand] = useState<string>(profile.buildCommand ?? "npm run build");
  const [gitAuthorName, setGitAuthorName] = useState("");
  const [gitAuthorEmail, setGitAuthorEmail] = useState("");

  const [diagnostics, setDiagnostics] = useState<WorkspaceDiagnostics | null>(null);
  const [syncSnapshot, setSyncSnapshot] = useState<SyncSnapshot | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [quickAction, setQuickAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadWorkspaceInfo = useCallback(async () => {
    if (!profile.workspacePath) {
      setDiagnostics(null);
      setSyncSnapshot(null);
      setIsLoadingInfo(false);
      return;
    }

    const profileQuery = `profileId=${encodeURIComponent(profile.id)}`;

    setIsLoadingInfo(true);
    try {
      const [diagRes, syncRes] = await Promise.all([
        fetch(`/api/workspace/diagnostics?${profileQuery}`),
        fetch(`/api/workspace/git?action=status&${profileQuery}`),
      ]);

      if (diagRes.ok) {
        const data = await diagRes.json();
        setDiagnostics(data);
        setGitAuthorName(data.gitAuthorName || "");
        setGitAuthorEmail(data.gitAuthorEmail || "");
      }

      if (syncRes.ok) {
        const data = await syncRes.json();
        setSyncSnapshot({
          ahead: data.sync?.ahead ?? 0,
          behind: data.sync?.behind ?? 0,
          upstream: data.sync?.upstream ?? "",
          branchProtected: !!data.branchProtected,
          autoFetchEnabled: !!data.autoFetchEnabled,
          autoFetchIntervalMinutes: data.autoFetchIntervalMinutes ?? 0,
        });
      }
    } catch {
      // Overview is best-effort; form remains usable.
    } finally {
      setIsLoadingInfo(false);
    }
  }, [profile.id, profile.workspacePath]);

  useEffect(() => {
    setWorkspaceName(profile.name || "");
    setWorkspacePath(profile.workspacePath || "");
    setBranchProtection(profile.branchProtection ?? true);
    setProtectedBranchesText((profile.protectedBranches ?? []).join(", "));
    setAutoFetch(profile.autoFetch ?? true);
    setDevPort(profile.port ?? 3000);
    setRunCommand(profile.runCommand ?? "npm run dev");
    setBuildCommand(profile.buildCommand ?? "npm run build");
    setGitAuthorName("");
    setGitAuthorEmail("");
    setMessage(null);
  }, [profile]);

  useEffect(() => {
    loadWorkspaceInfo();
  }, [loadWorkspaceInfo]);

  const handleBrowsePath = async () => {
    if (!window.electron?.selectDirectory) {
      setMessage({ type: "error", text: "Folder picker is only available in the desktop app." });
      return;
    }
    const selected = await window.electron.selectDirectory();
    if (selected) setWorkspacePath(selected);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: profile.id,
          updates: {
            name: workspaceName.trim() || profile.name,
            workspacePath,
            workspaceType,
            branchProtection,
            protectedBranches: protectedBranchesText
              .split(",")
              .map((b) => b.trim())
              .filter(Boolean),
            autoFetch,
            port: devPort,
            runCommand,
            buildCommand,
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.profile) {
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

        if (!identityRes.ok) {
          const identityData = await identityRes.json();
          setMessage({
            type: "error",
            text: identityData.error || "Workspace saved, but git identity update failed.",
          });
          onProfileUpdated(data.profile);
          loadWorkspaceInfo();
          return;
        }

        setMessage({ type: "success", text: "Workspace settings saved." });
        onProfileUpdated(data.profile);
        loadWorkspaceInfo();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to update workspace settings." });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage({ type: "error", text: `Error updating settings: ${msg}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFetchNow = async () => {
    setIsFetching(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch", profileId: profile.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Fetch failed." });
        return;
      }
      setMessage({ type: "success", text: "Remote changes fetched." });
      loadWorkspaceInfo();
    } catch {
      setMessage({ type: "error", text: "Fetch failed." });
    } finally {
      setIsFetching(false);
    }
  };

  const handleQuickAction = async (type: "folder" | "vscode") => {
    setQuickAction(type);
    setMessage(null);
    try {
      const res = await fetch("/api/workspace/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          type === "folder"
            ? { type: "folder", workspacePath }
            : { type: "ide", ide: "vscode", workspacePath }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Action failed." });
      }
    } catch {
      setMessage({ type: "error", text: "Action failed." });
    } finally {
      setQuickAction(null);
    }
  };

  const handleDeleteWorkspace = async () => {
    const confirmed = confirm(
      "Delete this workspace from OmniSync? Your files on disk and GitHub connection are kept."
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: profile.id }),
      });

      onProfileDeleted?.(profile.id);

      if (!onProfileDeleted) {
        const profilesRes = await fetch("/api/profiles");
        const data = await profilesRes.json();
        const remainingProfiles = (data.profiles || []) as UserProfile[];
        const nextActiveId = data.activeProfileId as string | null;

        if (remainingProfiles.length > 0 && nextActiveId) {
          const nextProfile = remainingProfiles.find((p) => p.id === nextActiveId);
          if (nextProfile?.workspacePath) {
            window.location.href = "/";
            return;
          }
          window.location.href = "/setup";
          return;
        }

        window.location.href = "/setup";
      }
    } catch (e) {
      console.error(e);
      alert("Error deleting workspace connection.");
    } finally {
      setIsDeleting(false);
    }
  };

  const gitClean = diagnostics?.gitStatus === "Clean";
  const missingCount = diagnostics?.missingDependencies.length ?? 0;
  const syncLabel =
    syncSnapshot == null
      ? "—"
      : syncSnapshot.ahead === 0 && syncSnapshot.behind === 0
        ? "Up to date"
        : `${syncSnapshot.ahead}↑ ${syncSnapshot.behind}↓`;

  return (
    <div
      className={embedded ? undefined : "animate-fade-slide"}
      style={{
        flex: embedded ? undefined : 1,
        padding: embedded ? 0 : "32px",
        overflowY: embedded ? undefined : "auto",
        backgroundColor: embedded ? "transparent" : "var(--color-bg-default)",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: embedded ? undefined : "800px",
        margin: embedded ? 0 : "0 auto",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
        <div>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "-0.5px",
              margin: 0,
              color: "var(--color-fg-default)",
              textWrap: "balance",
            }}
          >
            {embedded ? workspaceName || "Workspace" : "Workspace Settings"}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginTop: "4px", textWrap: "pretty" }}>
            {diagnostics?.projectName
              ? `${diagnostics.projectName} · v${diagnostics.projectVersion}`
              : "Repository path, git behavior, and development server configuration."}
            {isActive && (
              <span style={{ marginLeft: "6px", color: "var(--color-success-fg)", fontWeight: 600 }}>
                · Active workspace
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={loadWorkspaceInfo}
          disabled={isLoadingInfo}
          style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
            refresh
          </span>
          Refresh
        </button>
      </div>

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))",
          gap: "12px",
        }}
      >
        <StatCard
          label="Branch"
          value={isLoadingInfo ? "…" : diagnostics?.currentBranch || "—"}
          detail={syncSnapshot?.upstream ? syncSnapshot.upstream.split("/").pop() ?? undefined : undefined}
        />
        <StatCard
          label="Sync"
          value={isLoadingInfo ? "…" : syncLabel}
          detail={syncSnapshot?.autoFetchEnabled ? `Auto-fetch every ${syncSnapshot.autoFetchIntervalMinutes}m` : "Manual sync"}
          tone={
            syncSnapshot && (syncSnapshot.ahead > 0 || syncSnapshot.behind > 0)
              ? "warning"
              : "success"
          }
        />
        <StatCard
          label="Working tree"
          value={isLoadingInfo ? "…" : gitClean ? "Clean" : diagnostics?.gitStatus || "—"}
          tone={gitClean ? "success" : diagnostics?.gitStatus === "Not a Git repository" ? "danger" : "warning"}
        />
        <StatCard
          label="Dependencies"
          value={
            isLoadingInfo
              ? "…"
              : diagnostics?.packageJsonExists
                ? missingCount === 0
                  ? `${diagnostics.totalDependencies} OK`
                  : `${missingCount} missing`
                : "No package.json"
          }
          detail={diagnostics?.packageJsonExists ? `Node ${diagnostics.nodeVersion}` : undefined}
          tone={missingCount > 0 ? "warning" : "default"}
        />
      </div>

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div className="card" style={cardStyle}>
          <h3 style={sectionTitleStyle}>Identity</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle} htmlFor="workspace-name">
                Display name
              </label>
              <input
                id="workspace-name"
                type="text"
                className="form-control"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="My project"
                required
              />
              <span style={hintStyle}>Shown in the sidebar and workspace switcher.</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle}>GitHub connection</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border-default)",
                  backgroundColor: "var(--color-bg-subtle)",
                  fontSize: "13px",
                  minHeight: "38px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "16px",
                    color: profile.hasGitToken ? "var(--color-success-fg)" : "var(--color-fg-muted)",
                  }}
                >
                  {profile.hasGitToken ? "link" : "link_off"}
                </span>
                {profile.hasGitToken ? "Connected" : "Not connected"}
                <span style={{ ...hintStyle, marginLeft: "auto" }}>
                  {workspaceType === "automatic" ? "Cloned from GitHub" : "Local folder"}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle} htmlFor="workspace-git-name">
                Git author name
              </label>
              <input
                id="workspace-git-name"
                type="text"
                className="form-control"
                value={gitAuthorName}
                onChange={(e) => setGitAuthorName(e.target.value)}
                placeholder="John Doe"
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle} htmlFor="workspace-git-email">
                Git author email
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
          <span style={hintStyle}>
            Loaded from this repository&apos;s git configuration. Falls back to your global git config when unset.
          </span>
        </div>

        <div className="card" style={cardStyle}>
          <h3 style={sectionTitleStyle}>Repository</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={labelStyle} htmlFor="workspace-path">
              Local path
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                id="workspace-path"
                type="text"
                className="form-control"
                style={{ fontFamily: "var(--font-mono)", fontSize: "12px", flex: 1 }}
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                required
              />
              <button type="button" className="btn btn-secondary" onClick={handleBrowsePath} style={{ flexShrink: 0 }}>
                Browse
              </button>
            </div>
            <span style={hintStyle}>
              Folder on disk where git, diagnostics, and the file tree read from.
            </span>
          </div>

          {diagnostics?.remoteUrl && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle}>Remote origin</label>
              <code
                style={{
                  fontSize: "12px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  backgroundColor: "var(--color-bg-subtle)",
                  border: "1px solid var(--color-border-default)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sanitizeRemoteUrl(diagnostics.remoteUrl)}
              </code>
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={quickAction === "folder"}
              onClick={() => handleQuickAction("folder")}
            >
              {quickAction === "folder" ? "Opening…" : "Reveal in Finder"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={quickAction === "vscode"}
              onClick={() => handleQuickAction("vscode")}
            >
              {quickAction === "vscode" ? "Opening…" : "Open in VS Code"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isFetching || !profile.hasGitToken}
              onClick={handleFetchNow}
            >
              {isFetching ? "Fetching…" : "Fetch now"}
            </button>
          </div>
        </div>

        <div className="card" style={cardStyle}>
          <h3 style={sectionTitleStyle}>Git Sync</h3>

          <ToggleRow
            title="Branch protection"
            description="Block commits and pushes to main, master, and any additional branches listed below."
            checked={branchProtection}
            onChange={setBranchProtection}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={labelStyle} htmlFor="protected-branches">
              Additional protected branches
            </label>
            <input
              id="protected-branches"
              type="text"
              className="form-control"
              value={protectedBranchesText}
              onChange={(e) => setProtectedBranchesText(e.target.value)}
              placeholder="production, release"
              style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
              disabled={!branchProtection}
            />
          </div>

          <ToggleRow
            title="Background fetch"
            description="Periodically run git fetch for this workspace. Interval is set under Settings → Git."
            checked={autoFetch}
            onChange={setAutoFetch}
          />

          {syncSnapshot?.branchProtected && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                backgroundColor: "var(--color-attention-bg, rgba(210, 153, 34, 0.1))",
                color: "var(--color-attention-fg, #d29922)",
                border: "1px solid var(--color-attention-border, rgba(210, 153, 34, 0.3))",
              }}
            >
              Current branch is protected — direct commits are blocked.
            </div>
          )}
        </div>

        <div className="card" style={cardStyle}>
          <h3 style={sectionTitleStyle}>Development Server</h3>

          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle} htmlFor="dev-port">
                Port
              </label>
              <input
                id="dev-port"
                type="number"
                className="form-control"
                value={devPort}
                onChange={(e) => setDevPort(parseInt(e.target.value, 10) || 3000)}
                min={1}
                max={65535}
                required
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle} htmlFor="run-command">
                Dev command
              </label>
              <input
                id="run-command"
                type="text"
                className="form-control"
                style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
                value={runCommand}
                onChange={(e) => setRunCommand(e.target.value)}
                required
              />
              <PresetChips presets={RUN_PRESETS} onSelect={setRunCommand} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={labelStyle} htmlFor="build-command">
              Build command
            </label>
            <input
              id="build-command"
              type="text"
              className="form-control"
              style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
              value={buildCommand}
              onChange={(e) => setBuildCommand(e.target.value)}
              required
            />
            <PresetChips presets={BUILD_PRESETS} onSelect={setBuildCommand} />
            <span style={hintStyle}>Used by diagnostics and pre-sync build checks.</span>
          </div>
        </div>

        <div
          className="card"
          style={{
            ...cardStyle,
            borderColor: "var(--color-danger-border)",
            backgroundColor: "rgba(248, 81, 73, 0.05)",
          }}
        >
          <h3 style={{ ...sectionTitleStyle, color: "var(--color-danger-fg)" }}>Danger Zone</h3>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
            <p style={{ ...hintStyle, margin: 0, maxWidth: "480px", fontSize: "12px" }}>
              Remove this workspace from OmniSync. Your project files on disk and GitHub sign-in are not affected.
            </p>
            <button
              type="button"
              onClick={handleDeleteWorkspace}
              disabled={isDeleting}
              className="btn btn-danger"
              style={{ padding: "8px 16px", fontSize: "12px", fontWeight: 600, flexShrink: 0 }}
            >
              {isDeleting ? "Deleting…" : "Delete workspace"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ minWidth: "140px" }}>
            {isSaving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
