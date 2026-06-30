"use client";

import { useState, useEffect } from "react";
import { useRouter as useAppRouter } from "next/navigation";
import { UserProfile } from "@/lib/profiles";

interface DiagnosticScanResult {
  nodeVersion: string;
  npmVersion: string;
  enginesNode: string;
  isNodeCompatible: boolean;
  packageJsonExists: boolean;
  totalDependencies: number;
  missingDependencies: string[];
  gitStatus: string;
}

export default function SetupPage() {
  const router = useAppRouter();
  
  // Steps: login -> profile-selection -> repo-selection
  const [step, setStep] = useState<"login" | "profile-selection" | "repo-selection">("login");

  // OAuth / Git Connection State
  const [gitUsername, setGitUsername] = useState("");
  const [gitToken, setGitToken] = useState("");

  // Profiles State
  const [profilesList, setProfilesList] = useState<UserProfile[]>([]);

  // Repo setup state
  const [repoName, setRepoName] = useState("");

  // Manual setup state
  const [manualPath, setManualPath] = useState("");
  const [manualStatus, setManualStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [manualScanResult, setManualScanResult] = useState<DiagnosticScanResult | null>(null);
  const [manualError, setManualError] = useState("");

  // Fetch all profiles
  const loadProfiles = async () => {
    try {
      const res = await fetch("/api/profiles");
      const data = await res.json();
      const profiles = data.profiles || [];
      setProfilesList(profiles);
      if (profiles.length > 0) {
        setStep("profile-selection");
      } else if (data.activeProfileId) {
        setStep("profile-selection");
      }
    } catch {}
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      loadProfiles();
    });
  }, []);

  // Handle GitHub Login (Manual PAT route)
  const handleGitLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUsername) {
      alert("Please enter a username");
      return;
    }
    setManualPath(process.cwd());
    setStep("profile-selection");
  };

  // Select an existing workspace profile and launch
  const handleProfileSelect = async (profileId: string) => {
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", id: profileId }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/");
      } else {
        alert(`Error selecting workspace: ${data.error}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Error selecting workspace: ${msg}`);
    }
  };

  // Run manual scan verification
  const runManualScan = async () => {
    if (!manualPath) {
      setManualError("Please specify a directory path");
      return;
    }

    setManualStatus("scanning");
    setManualError("");

    try {
      // Create new profile dynamically for this repository workspace (Use manual folder base name if repo name isn't set)
      const workspaceRecordName = repoName || manualPath.split("/").pop() || "local-repo";
      const profRes = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: workspaceRecordName,
          profession: "Developer Workspace",
          gitToken,
        }),
      });

      const profData = await profRes.json();
      if (!profData.success) {
        throw new Error(profData.error || "Failed to initialize workspace record");
      }

      const newProfile = profData.profile as UserProfile;

      // Update workspace path
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: newProfile.id,
          updates: {
            workspacePath: manualPath,
            workspaceType: "manual",
          },
        }),
      });

      // Scan diagnostics
      const diagRes = await fetch("/api/workspace/diagnostics");
      const diagData = await diagRes.json();

      if (diagData.error) {
        throw new Error(diagData.error);
      }

      setManualScanResult(diagData as DiagnosticScanResult);
      setManualStatus("success");
    } catch (err: unknown) {
      setManualStatus("error");
      setManualError(err instanceof Error ? err.message : "Failed to scan folder. Make sure the directory exists and contains a package.json.");
    }
  };

  const handleLaunchManual = () => {
    router.push("/");
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "24px",
      backgroundColor: "var(--color-bg-default)",
    }}>
      {/* STEP 1: GITHUB LOGIN */}
      {step === "login" && (
        <div className="animate-fade-slide" style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          backgroundColor: "var(--color-bg-subtle)",
          border: "1px solid var(--color-border-default)",
          borderRadius: "12px",
          width: "780px",
          maxWidth: "100%",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}>
          {/* Left Column: Product Branding */}
          <div style={{
            flex: 1.2,
            padding: "40px",
            background: "linear-gradient(135deg, rgba(88, 166, 255, 0.05) 0%, rgba(188, 140, 255, 0.05) 100%)",
            borderRight: "1px solid var(--color-border-default)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-fg-default)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.73-2.79" />
                </svg>
                <span style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "var(--color-fg-default)",
                  letterSpacing: "-0.5px"
                }}>
                  OmniSync
                </span>
              </div>

              <h1 style={{ fontSize: "28px", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-1px", marginBottom: "16px", color: "var(--color-fg-default)" }}>
                The Local Deck for GitHub
              </h1>
              
              <p style={{ fontSize: "14px", color: "var(--color-fg-muted)", marginBottom: "32px", lineHeight: "20px" }}>
                Integrate code editing, terminal execution, live background logs, and visual merge resolution in a single local workspace control center.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "6px", backgroundColor: "rgba(88,166,255,0.1)", fontSize: "14px", flexShrink: 0, marginTop: "2px" }}>
                    💻
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px" }}>Integrated Code Viewer</div>
                    <div style={{ fontSize: "12px", color: "var(--color-fg-muted)" }}>Inspect repository folders, switch branches, and track commits.</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "6px", backgroundColor: "rgba(63,185,80,0.1)", fontSize: "14px", flexShrink: 0, marginTop: "2px" }}>
                    🔀
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px" }}>Three-Pane Conflict Resolver</div>
                    <div style={{ fontSize: "12px", color: "var(--color-fg-muted)" }}>Resolve merges interactively without complex terminal inputs.</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "6px", backgroundColor: "rgba(210,153,34,0.1)", fontSize: "14px", flexShrink: 0, marginTop: "2px" }}>
                    ⚡
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px" }}>Deterministic Scanner</div>
                    <div style={{ fontSize: "12px", color: "var(--color-fg-muted)" }}>Verify package integrity and execute safe cache repairs.</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: "11px", color: "var(--color-fg-subtle)", marginTop: "32px" }}>
              Verifying active environment configuration on startup.
            </div>
          </div>

          {/* Right Column: Connection Form */}
          <div style={{
            flex: 1,
            padding: "40px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            backgroundColor: "rgba(22, 27, 34, 0.4)",
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "4px" }}>Connect Account</h2>
            <p style={{ fontSize: "12px", color: "var(--color-fg-muted)", marginBottom: "24px" }}>
              Authorize OmniSync to sync remote branches and workspace settings.
            </p>

            <form onSubmit={handleGitLogin}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: "500", fontSize: "13px" }}>GitHub Username</label>
                <input
                  type="text"
                  className="form-control"
                  value={gitUsername}
                  onChange={(e) => setGitUsername(e.target.value)}
                  placeholder="octocat"
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: "20px" }}>
                <label className="form-label" style={{ fontWeight: "500", fontSize: "13px", display: "flex", justifyContent: "space-between" }}>
                  <span>Personal Access Token</span>
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "var(--color-accent-fg)", textDecoration: "none" }}>
                    Generate
                  </a>
                </label>
                <input
                  type="password"
                  className="form-control"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                />
                <span className="form-note">Used to fetch your remote repositories (optional).</span>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button type="button" className="btn" onClick={() => setStep("profile-selection")} style={{ flex: 1 }}>
                  Skip
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>
                  Authorize & Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STEP 2: WORKSPACE PROFILE SELECTION */}
      {step === "profile-selection" && (
        <div className="animate-fade-slide" style={{ width: "680px", maxWidth: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.5px", marginBottom: "8px" }}>Select Workspace</h1>
            <p style={{ color: "var(--color-fg-muted)", fontSize: "14px" }}>Choose a previously set up repository workspace or initialize a new one.</p>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}>
            {profilesList.map((p) => (
              <div
                key={p.id}
                onClick={() => handleProfileSelect(p.id)}
                className="interactive-card"
                style={{
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "8px",
                  padding: "16px",
                  backgroundColor: "var(--color-bg-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: "150px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    <div style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "6px",
                      backgroundColor: "var(--color-accent-bg)",
                      color: "var(--color-accent-fg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      fontSize: "14px",
                    }}>
                      📦
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>Manual Path</div>
                    </div>
                  </div>

                  <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", wordBreak: "break-all", lineHeight: "14px" }}>
                    {p.workspacePath || "No path set"}
                  </div>
                </div>

                <div style={{ fontSize: "12px", color: "var(--color-accent-fg)", fontWeight: 600, textAlign: "right", marginTop: "12px" }}>
                  Launch →
                </div>
              </div>
            ))}

            {/* Dotted "+" Card to Add Workspace Repo */}
            <div
              onClick={() => {
                setStep("repo-selection");
                setRepoName("");
              }}
              className="interactive-card"
              style={{
                border: "2px dashed var(--color-border-default)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "150px",
                cursor: "pointer",
                backgroundColor: "transparent",
              }}
            >
              <div style={{ fontSize: "28px", color: "var(--color-fg-muted)", marginBottom: "8px" }}>+</div>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--color-fg-muted)", textAlign: "center" }}>Set up new repository</div>
            </div>
          </div>

          <div style={{ textAlign: "left" }}>
            <button className="btn btn-danger" onClick={async () => {
              await fetch("/api/profiles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "select", id: null }),
              });
              setStep("login");
            }}>
              Log Out
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: REPOSITORY SELECTION & CONFIGURATION */}
      {step === "repo-selection" && (
        <div className="animate-fade-slide" style={{ width: "540px", maxWidth: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.5px", marginBottom: "8px" }}>Link Local Repository</h1>
            <p style={{ color: "var(--color-fg-muted)", fontSize: "14px" }}>
              Point OmniSync directly to an already created repository on this machine.
            </p>
          </div>

          <div style={{
            backgroundColor: "var(--color-bg-subtle)",
            border: "1px solid var(--color-border-default)",
            borderRadius: "8px",
            padding: "24px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Link Local Repository</h2>
              <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginBottom: "20px" }}>
                Provide the directory path of an existing repository already created on your device.
              </p>

              <div className="form-group" style={{ marginBottom: "20px" }}>
                <label className="form-label" style={{ fontWeight: 500, fontSize: "12px" }}>Pre-existing Folder Path</label>
                <input
                  type="text"
                  className="form-control"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="/Users/username/Documents/GitHub/project"
                  required
                />
                <span className="form-note">OmniSync will verify this path, scan its Node compatibility, and configure logs.</span>
              </div>

              {manualStatus === "idle" && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%", padding: "10px", fontWeight: "600" }}
                  onClick={runManualScan}
                >
                  Verify & Scan Directory
                </button>
              )}

              {manualStatus === "scanning" && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px", backgroundColor: "var(--color-bg-overlay)", borderRadius: "6px" }}>
                  <div className="spinner"></div>
                  <span style={{ fontSize: "13px" }}>Analyzing node compatibility levels and package.json configurations...</span>
                </div>
              )}

              {manualStatus === "success" && manualScanResult && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
                  <div className="flash flash-success" style={{ margin: 0, padding: "8px 12px", fontSize: "12px" }}>
                    Workspace verified successfully. Click below to launch.
                  </div>
                  
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                        <td style={{ padding: "8px 0", color: "var(--color-fg-muted)" }}>Node.js Compatibility</td>
                        <td style={{ padding: "8px 0", textAlign: "right" }}>
                          {manualScanResult.isNodeCompatible ? (
                            <span className="badge badge-success">Compatible ({manualScanResult.nodeVersion})</span>
                          ) : (
                            <span className="badge badge-danger">Incompatible ({manualScanResult.nodeVersion})</span>
                          )}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                        <td style={{ padding: "8px 0", color: "var(--color-fg-muted)" }}>Dependencies Checked</td>
                        <td style={{ padding: "8px 0", textAlign: "right" }}>
                          {manualScanResult.missingDependencies.length === 0 ? "All verified" : `${manualScanResult.missingDependencies.length} missing`}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <button
                    type="button"
                    className="btn btn-success"
                    style={{ width: "100%", padding: "10px", fontWeight: "600" }}
                    onClick={handleLaunchManual}
                  >
                    Launch Workspace
                  </button>
                </div>
              )}

              {manualError && (
                <div className="flash flash-danger" style={{ marginTop: "16px", fontSize: "12px" }}>
                  {manualError}
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: "12px", display: "flex", justifyContent: "space-between" }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setStep("profile-selection")}
                disabled={manualStatus === "scanning"}
              >
                Back to Workspaces
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
