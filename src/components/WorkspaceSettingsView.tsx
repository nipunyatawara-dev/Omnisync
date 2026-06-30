"use client";

import { useState } from "react";
import { UserProfile } from "@/lib/profiles";

interface WorkspaceSettingsViewProps {
  activeProfile: UserProfile | null;
  onProfileUpdated: (updated: UserProfile) => void;
}

export default function WorkspaceSettingsView({ activeProfile, onProfileUpdated }: WorkspaceSettingsViewProps) {
  // Workspace / Local Repository configurations
  const [workspacePath, setWorkspacePath] = useState(activeProfile?.workspacePath || "");
  const workspaceType = activeProfile?.workspaceType || "manual";
  const gitToken = activeProfile?.gitToken || "";

  // Repository-specific settings
  const [branchProtection, setBranchProtection] = useState<boolean>(activeProfile?.branchProtection ?? true);
  const [autoFetch, setAutoFetch] = useState<boolean>(activeProfile?.autoFetch ?? true);
  const [devPort, setDevPort] = useState<number>(activeProfile?.port ?? 3000);
  const [runCommand, setRunCommand] = useState<string>(activeProfile?.runCommand ?? "npm run dev");
  const [buildCommand, setBuildCommand] = useState<string>(activeProfile?.buildCommand ?? "npm run build");

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: activeProfile.id,
          updates: {
            workspacePath,
            workspaceType,
            gitToken,
            branchProtection,
            autoFetch,
            port: devPort,
            runCommand,
            buildCommand,
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.profile) {
        setMessage({ type: "success", text: "Workspace settings saved successfully! Directory maps updated." });
        onProfileUpdated(data.profile);
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

  const handleDeleteWorkspace = async () => {
    if (!activeProfile) return;
    const confirmed = confirm("WARNING: Are you absolutely sure you want to disconnect and delete this workspace configuration? All dashboard logs and local caches will be cleared.");
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      // 1. Delete profile
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id: activeProfile.id,
        }),
      });

      // 2. Select null profile
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "select",
          id: null,
        }),
      });

      // 3. Redirect back to setup wizard
      window.location.href = "/setup";
    } catch (e) {
      console.error(e);
      alert("Error deleting workspace connection.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="animate-fade-slide" style={{
      flex: 1,
      padding: "32px",
      overflowY: "auto",
      backgroundColor: "var(--color-bg-default)",
      display: "flex",
      flexDirection: "column",
      gap: "24px",
      maxWidth: "800px",
      margin: "0 auto",
      width: "100%",
    }}>
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px", margin: 0, color: "var(--color-fg-default)" }}>
          Workspace Settings
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginTop: "4px" }}>
          Configure git synchronization parameters, build command pipelines, and local repository mappings.
        </p>
      </div>

      {message && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "6px",
          fontSize: "13px",
          backgroundColor: message.type === "success" ? "var(--color-success-bg)" : "var(--color-danger-bg)",
          color: message.type === "success" ? "var(--color-success-fg)" : "var(--color-danger-fg)",
          border: `1px solid ${message.type === "success" ? "var(--color-success-border)" : "var(--color-danger-border)"}`,
          transition: "all 0.15s ease",
        }}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Workspace Path Settings Section */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: "600", textTransform: "uppercase", color: "var(--color-fg-muted)", margin: 0 }}>
            Local Repository Connection
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600 }}>Local Directory Path</label>
            <input
              type="text"
              className="form-control"
              style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              required
            />
            <span style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>
              The local file system path where the repository resides. Modifying this redirects code diagnostics and Git queries immediately.
            </span>
          </div>


        </div>

        {/* Local Git & Build Parameters */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: "600", textTransform: "uppercase", color: "var(--color-fg-muted)", margin: 0 }}>
            Git Sync & Runner Settings
          </h3>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={branchProtection}
                onChange={(e) => setBranchProtection(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <span>Prevent direct commits to <strong>main</strong> / <strong>master</strong> branches</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={autoFetch}
                onChange={(e) => setAutoFetch(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <span>Enable background automatic fetch (`git fetch`) of remote commits</span>
            </label>
          </div>

          <hr style={{ border: "none", borderBottom: "1px solid var(--color-border-default)", margin: "8px 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600 }}>Development Server Port</label>
              <input
                type="number"
                className="form-control"
                value={devPort}
                onChange={(e) => setDevPort(parseInt(e.target.value) || 3000)}
                required
              />
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600 }}>Dev Run Command</label>
              <input
                type="text"
                className="form-control"
                style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
                value={runCommand}
                onChange={(e) => setRunCommand(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600 }}>Build Check Command</label>
            <input
              type="text"
              className="form-control"
              style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
              value={buildCommand}
              onChange={(e) => setBuildCommand(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Danger Zone Section */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px", borderColor: "var(--color-danger-border)", backgroundColor: "rgba(248, 81, 73, 0.05)" }}>
          <h3 style={{ fontSize: "13px", fontWeight: "600", textTransform: "uppercase", color: "var(--color-danger-fg)", margin: 0 }}>
            Danger Zone
          </h3>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", maxWidth: "480px" }}>
              Disconnect and delete this workspace configuration. This will clear the active developer profile from the tool session.
            </div>
            <button
              type="button"
              onClick={handleDeleteWorkspace}
              disabled={isDeleting}
              className="btn btn-danger"
              style={{ padding: "8px 16px", fontSize: "12px", fontWeight: 600 }}
            >
              {isDeleting ? "Deleting..." : "Delete Workspace"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSaving}
            style={{ minWidth: "140px" }}
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
