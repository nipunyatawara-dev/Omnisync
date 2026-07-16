"use client";

import type { GlobalSettings } from "@/lib/globalSettingsTypes";

interface GlobalSettingsViewProps {
  settings: GlobalSettings;
  isLoading: boolean;
  isSaving: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onUpdate: <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => void;
  onSave: () => void;
  section: "general" | "git";
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

export default function GlobalSettingsView({
  settings,
  isLoading,
  isSaving,
  message,
  onUpdate,
  onSave,
  section,
}: GlobalSettingsViewProps) {
  if (isLoading) {
    return (
      <div style={{ padding: "32px", color: "var(--color-fg-muted)", fontSize: "13px" }}>
        Loading global settings…
      </div>
    );
  }

  if (section === "general") {
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
          <h3 style={sectionTitleStyle}>System</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={labelStyle} htmlFor="terminal-shell">
              Terminal Shell
            </label>
            <select
              id="terminal-shell"
              className="form-control"
              value={settings.terminalShell}
              onChange={(e) => onUpdate("terminalShell", e.target.value)}
            >
              <option value="zsh">zsh (macOS default)</option>
              <option value="bash">bash</option>
              <option value="fish">fish</option>
              <option value="sh">sh</option>
            </select>
            <span style={hintStyle}>Shell used when starting the development server runner.</span>
          </div>

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
              <div style={{ fontSize: "13px", fontWeight: 600 }}>Show hidden files</div>
              <div style={hintStyle}>
                Display dotfiles (e.g. .env, .gitignore) in the workspace file tree.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.showHiddenFiles}
              onChange={(e) => onUpdate("showHiddenFiles", e.target.checked)}
              style={{ width: "16px", height: "16px", marginTop: "2px", flexShrink: 0 }}
            />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" disabled={isSaving} onClick={onSave}>
            {isSaving ? "Saving…" : "Save General Settings"}
          </button>
        </div>
      </div>
    );
  }

  if (section === "git") {
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
            Global default author for OmniSync. Used as the fallback for workspaces and applied to
            the active repository when you save. Edit a workspace&apos;s own identity from that
            workspace&apos;s Settings → Git.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle} htmlFor="git-username">
                Author name
              </label>
              <input
                id="git-username"
                type="text"
                className="form-control"
                value={settings.gitUsername}
                onChange={(e) => onUpdate("gitUsername", e.target.value)}
                placeholder="John Doe"
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle} htmlFor="git-email">
                Author email
              </label>
              <input
                id="git-email"
                type="email"
                className="form-control"
                value={settings.gitEmail}
                onChange={(e) => onUpdate("gitEmail", e.target.value)}
                placeholder="john@example.com"
              />
            </div>
          </div>
        </div>

        <div className="card" style={cardStyle}>
          <h3 style={sectionTitleStyle}>Sync Defaults</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle} htmlFor="default-branch">
                Default branch
              </label>
              <input
                id="default-branch"
                type="text"
                className="form-control"
                style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
                value={settings.defaultBranch}
                onChange={(e) => onUpdate("defaultBranch", e.target.value)}
                placeholder="main"
              />
              <span style={hintStyle}>
                Used for upstream comparison when syncing. Defaults to the active workspace&apos;s current branch.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={labelStyle} htmlFor="auto-fetch">
                Background fetch interval
              </label>
              <select
                id="auto-fetch"
                className="form-control"
                value={settings.autoFetchInterval}
                onChange={(e) => onUpdate("autoFetchInterval", e.target.value)}
              >
                <option value="0">Never (manual sync only)</option>
                <option value="1">Every 1 minute</option>
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
              </select>
              <span style={hintStyle}>
                Requires workspace auto-fetch to be enabled in workspace settings.
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" disabled={isSaving} onClick={onSave}>
            {isSaving ? "Saving…" : "Save Git Settings"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
