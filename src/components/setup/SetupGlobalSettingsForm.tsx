"use client";

interface SetupGlobalSettingsFormProps {
  globalGitUsername: string;
  setGlobalGitUsername: (v: string) => void;
  globalGitEmail: string;
  setGlobalGitEmail: (v: string) => void;
  defaultBranch: string;
  setDefaultBranch: (v: string) => void;
  autoFetchInterval: string;
  setAutoFetchInterval: (v: string) => void;
  terminalShell: string;
  setTerminalShell: (v: string) => void;
  showHiddenFiles: boolean;
  setShowHiddenFiles: (v: boolean) => void;
  accentColor: string;
  setAccentColor: (v: string) => void;
  onSave: () => void;
}

/** Global preferences form extracted from the setup wizard settings modal. */
export default function SetupGlobalSettingsForm({
  globalGitUsername,
  setGlobalGitUsername,
  globalGitEmail,
  setGlobalGitEmail,
  defaultBranch,
  setDefaultBranch,
  autoFetchInterval,
  setAutoFetchInterval,
  terminalShell,
  setTerminalShell,
  showHiddenFiles,
  setShowHiddenFiles,
  accentColor,
  setAccentColor,
  onSave,
}: SetupGlobalSettingsFormProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-accent-fg)", margin: 0 }}>
        Global Application Preferences
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>Terminal Shell</label>
        <select
          value={terminalShell}
          onChange={(e) => setTerminalShell(e.target.value)}
          className="form-control"
          style={{ width: "100%", padding: "6px", fontSize: "12px" }}
        >
          <option value="zsh">zsh</option>
          <option value="bash">bash</option>
          <option value="fish">fish</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>Accent Theme</label>
        <select
          value={accentColor}
          onChange={(e) => setAccentColor(e.target.value)}
          className="form-control"
          style={{ width: "100%", padding: "6px", fontSize: "12px" }}
        >
          <option value="default">Default Steel Blue</option>
          <option value="emerald">Emerald Green</option>
          <option value="royal">Royal Purple</option>
          <option value="sunset">Sunset Orange</option>
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600 }}>Show Hidden Files</div>
          <div style={{ fontSize: "10px", color: "var(--color-fg-muted)" }}>
            Toggle visibility of dotfiles in the workspace tree
          </div>
        </div>
        <input
          type="checkbox"
          checked={showHiddenFiles}
          onChange={(e) => setShowHiddenFiles(e.target.checked)}
          style={{ width: "16px", height: "16px" }}
        />
      </div>

      <hr style={{ border: "none", borderBottom: "1px solid var(--color-border-default)", margin: "8px 0" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>Git Author Username</label>
        <input
          type="text"
          value={globalGitUsername}
          onChange={(e) => setGlobalGitUsername(e.target.value)}
          className="form-control"
          style={{ fontSize: "12px" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>Git Author Email</label>
        <input
          type="email"
          value={globalGitEmail}
          onChange={(e) => setGlobalGitEmail(e.target.value)}
          className="form-control"
          style={{ fontSize: "12px" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>Default Branch</label>
        <input
          type="text"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
          className="form-control"
          style={{ fontSize: "12px" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>Auto-Fetch Frequency</label>
        <select
          value={autoFetchInterval}
          onChange={(e) => setAutoFetchInterval(e.target.value)}
          className="form-control"
          style={{ fontSize: "12px" }}
        >
          <option value="0">Never (Manual Sync)</option>
          <option value="1">Every 1 minute</option>
          <option value="5">Every 5 minutes</option>
          <option value="15">Every 15 minutes</option>
        </select>
      </div>

      <button type="button" className="btn btn-sm btn-primary" onClick={onSave} style={{ alignSelf: "flex-end" }}>
        Save Preferences
      </button>
    </div>
  );
}
