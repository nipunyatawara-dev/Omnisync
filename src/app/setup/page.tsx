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

const MOCK_REPOS = [
  { name: "omnisync-editor", desc: "A TypeScript code editor, background dev server runner, and diagnostic scan control center.", stars: 24, lang: "TypeScript" },
  { name: "nextjs-electron-utility", desc: "A template config for packaging Next.js App Router applications into static Electron app binaries.", stars: 45, lang: "JavaScript" },
  { name: "billcraft-invoice-manager", desc: "A billing manager workspace with local profile locks, catalog management, and PDF reports.", stars: 82, lang: "TypeScript" },
  { name: "starlight-dashboard", desc: "A sleek dark-theme admin monitoring board with real-time process monitoring logs.", stars: 12, lang: "CSS" },
  { name: "personal-website", desc: "My developer portfolio site containing visual summaries and interactive layout previews.", stars: 6, lang: "HTML" },
  { name: "react-components-lib", desc: "Highly customizable UI components library.", stars: 18, lang: "TypeScript" },
  { name: "node-cli-boilerplate", desc: "Template for building Node.js command line tools.", stars: 9, lang: "JavaScript" },
  { name: "python-data-analyzer", desc: "Scripts for data parsing and regression models.", stars: 33, lang: "Python" },
  { name: "electron-dock-app", desc: "Menubar dashboard controller for macOS.", stars: 54, lang: "Swift" },
  { name: "gemini-mcp-server", desc: "Model Context Protocol adapter for AI assistants.", stars: 104, lang: "TypeScript" },
  { name: "go-web-server", desc: "Lightweight, performant HTTP server boilerplate in Go.", stars: 29, lang: "Go" },
  { name: "docker-k8s-configs", desc: "Kubernetes yaml manifests and Dockerfiles for production deployment.", stars: 15, lang: "Shell" },
  { name: "blog-engine-astro", desc: "Fast markdown blogging engine styled with Tailwind.", stars: 22, lang: "TypeScript" },
  { name: "ios-workout-tracker", desc: "SwiftUI mobile tracker app for workouts.", stars: 41, lang: "Swift" },
  { name: "rust-game-engine", desc: "Simple 2D game engine built on Rust and wgpu.", stars: 76, lang: "Rust" },
];

export default function SetupPage() {
  const router = useAppRouter();
  
  // Steps: login -> profile-selection -> repo-selection
  const [step, setStep] = useState<"login" | "profile-selection" | "repo-selection">("login");
  
  // Top level toggle for repository setup mode
  const [setupMode, setSetupMode] = useState<"github" | "local">("github");

  // OAuth / Git Connection State
  const [gitUsername, setGitUsername] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [showManualToken, setShowManualToken] = useState(false);
  const [isOauthModalOpen, setIsOauthModalOpen] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<"idle" | "authenticating" | "success">("idle");

  // Profiles State
  const [profilesList, setProfilesList] = useState<UserProfile[]>([]);

  // Repo setup state (Selected Repo starts empty so right side is grayed out by default)
  const [repoName, setRepoName] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  
  // Automatic setup state
  const [targetPath, setTargetPath] = useState("");
  const [autoStatus, setAutoStatus] = useState<"idle" | "installing" | "auditing" | "finishing" | "success" | "error">("idle");
  const [autoLogs, setAutoLogs] = useState<string[]>([]);
  const [autoError, setAutoError] = useState("");

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

  // Handle OAuth Simulated Flow
  const handleOauthStart = () => {
    setIsOauthModalOpen(true);
    setOauthStatus("authenticating");
  };

  const handleOauthAuthorize = () => {
    setOauthStatus("success");
    setGitUsername("shockagg");
    setGitToken("gho_mock_oauth_token_12345");
    setTargetPath("");
    setManualPath(process.cwd());
    
    setTimeout(() => {
      setIsOauthModalOpen(false);
      setStep("profile-selection");
    }, 800);
  };

  // Handle GitHub Login (Manual PAT route)
  const handleGitLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUsername) {
      alert("Please enter a username");
      return;
    }
    setTargetPath("");
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

  // Handle repository selection
  const handleRepoClick = (name: string) => {
    setSelectedRepo(name);
    setRepoName(name);
    setTargetPath(`/Users/shockagg/Documents/GitHub/OmniSync/${name}`);
    setAutoStatus("idle");
    setAutoError("");
  };

  // Run automatic installation and audit fix
  const runAutomaticSetup = async () => {
    if (!targetPath) {
      setAutoError("Target path is required.");
      return;
    }

    setAutoStatus("installing");
    setAutoLogs(["Creating folder structure...", `Target: ${targetPath}`]);

    try {
      // Create new profile dynamically for this repository workspace
      const profRes = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: repoName,
          profession: "Developer Workspace",
          gitToken,
        }),
      });

      const profData = await profRes.json();
      if (!profData.success) {
        throw new Error(profData.error || "Failed to initialize workspace record");
      }

      const newProfile = profData.profile as UserProfile;

      // Update workspace type and path
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: newProfile.id,
          updates: {
            workspacePath: targetPath,
            workspaceType: "automatic",
          },
        }),
      });

      setAutoLogs(prev => [...prev, "Initializing package.json template...", "Installing next, react, react-dom dependencies..."]);
      
      await fetch("/api/workspace/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });

      setAutoLogs(prev => [...prev, "Running security updates and vulnerability scans...", "Executing npm audit fix --force..."]);
      
      await fetch("/api/workspace/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "audit-fix" }),
      });
      
      setAutoStatus("finishing");
      setAutoLogs(prev => [...prev, "Vulnerabilities resolved.", "Workspace database configured.", "Redirecting to main workspace dashboard..."]);
      
      setTimeout(() => {
        setAutoStatus("success");
        router.push("/");
      }, 1500);

    } catch (err: unknown) {
      setAutoStatus("error");
      setAutoError(err instanceof Error ? err.message : "An error occurred during automatic setup.");
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

  const filteredRepos = MOCK_REPOS.filter((r) =>
    r.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
    r.desc.toLowerCase().includes(repoSearchQuery.toLowerCase())
  );

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

            {!showManualToken ? (
              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontWeight: "600",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    backgroundColor: "var(--color-btn-primary-bg)",
                    border: "1px solid var(--color-btn-primary-border)",
                    marginBottom: "16px",
                  }}
                  onClick={handleOauthStart}
                >
                  <svg height="16" viewBox="0 0 24 24" width="16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="18" r="3" />
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 15V9a4 4 0 0 0-4-4H9" />
                    <line x1="6" y1="9" x2="6" y2="15" />
                  </svg>
                  Sign in with GitHub App
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "16px 0", color: "var(--color-fg-subtle)", fontSize: "11px" }}>
                  <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border-default)" }}></div>
                  <span>or configure manually</span>
                  <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border-default)" }}></div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowManualToken(true)}
                  className="btn"
                  style={{ width: "100%", fontSize: "12px", padding: "6px" }}
                >
                  Use Personal Access Token (PAT)
                </button>
              </div>
            ) : (
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
                  <span className="form-note">Used to fetch your remote repositories.</span>
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                  <button type="button" className="btn" onClick={() => setShowManualToken(false)} style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>
                    Authorize & Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: WORKSPACE PROFILE SELECTION (BillCraft Style) */}
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
                      <div style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>{p.workspaceType === "automatic" ? "Auto Setup" : "Manual Path"}</div>
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
                setSetupMode("github");
                setSelectedRepo("");
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

      {/* STEP 3: REPOSITORY SELECTION & CONFIGURATION (WITH TOP MODE TOGGLE) */}
      {step === "repo-selection" && (
        <div className="animate-fade-slide" style={{ width: setupMode === "github" ? "960px" : "540px", maxWidth: "100%", transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          
          {/* Top Toggle Switch */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
            <div style={{
              display: "inline-flex",
              backgroundColor: "var(--color-bg-subtle)",
              border: "1px solid var(--color-border-default)",
              borderRadius: "20px",
              padding: "3px",
            }}>
              <button
                type="button"
                className="btn"
                style={{
                  borderRadius: "16px",
                  padding: "6px 16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "none",
                  backgroundColor: setupMode === "github" ? "var(--color-btn-primary-bg)" : "transparent",
                  color: setupMode === "github" ? "white" : "var(--color-fg-muted)",
                }}
                onClick={() => setSetupMode("github")}
              >
                Setup Repository from GitHub
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  borderRadius: "16px",
                  padding: "6px 16px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "none",
                  backgroundColor: setupMode === "local" ? "var(--color-btn-primary-bg)" : "transparent",
                  color: setupMode === "local" ? "white" : "var(--color-fg-muted)",
                }}
                onClick={() => setSetupMode("local")}
              >
                Setup Repo Locally
              </button>
            </div>
          </div>

          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.5px", marginBottom: "8px" }}>Select a Repo</h1>
            <p style={{ color: "var(--color-fg-muted)", fontSize: "14px" }}>
              {setupMode === "github" 
                ? `Sync a remote repository from @${gitUsername || "github"} to a local clone destination.`
                : "Point OmniSync directly to an already created repository on this machine."}
            </p>
          </div>

          {/* VIEWPORT MODE 1: GITHUB SPLIT SCREEN GRID */}
          {setupMode === "github" && (
            <div style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "stretch",
              gap: "24px",
              minHeight: "440px",
            }}>
              {/* Left Column: Repository Scrollable List */}
              <div style={{
                flex: 1.1,
                backgroundColor: "var(--color-bg-subtle)",
                border: "1px solid var(--color-border-default)",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
              }}>
                <div style={{ marginBottom: "12px" }}>
                  <input
                    type="text"
                    className="form-control"
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px" }}
                    placeholder="🔍 Search remote repositories..."
                    value={repoSearchQuery}
                    onChange={(e) => setRepoSearchQuery(e.target.value)}
                  />
                </div>

                <div style={{
                  flex: 1,
                  maxHeight: "340px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  paddingRight: "4px",
                }}>
                  {filteredRepos.length === 0 ? (
                    <div style={{ padding: "24px", color: "var(--color-fg-muted)", fontSize: "13px", textAlign: "center" }}>
                      No matching repositories found.
                    </div>
                  ) : (
                    filteredRepos.map((r) => (
                      <div
                        key={r.name}
                        onClick={() => handleRepoClick(r.name)}
                        style={{
                          border: selectedRepo === r.name ? "1px solid var(--color-accent-border)" : "1px solid var(--color-border-default)",
                          borderRadius: "6px",
                          padding: "10px 12px",
                          backgroundColor: selectedRepo === r.name ? "var(--color-accent-bg)" : "rgba(0,0,0,0.1)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 600, color: selectedRepo === r.name ? "var(--color-accent-fg)" : "var(--color-fg-default)", fontSize: "13px" }}>
                            {r.name}
                          </span>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "11px", color: "var(--color-fg-muted)" }}>
                            <span>★ {r.stars}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.desc}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ borderTop: "1px solid var(--color-border-default)", marginTop: "16px", paddingTop: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)", marginBottom: "6px" }}>Or enter name manually:</div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      className="form-control"
                      style={{ flex: 1, padding: "4px 8px", fontSize: "12px" }}
                      placeholder="my-custom-repo"
                      value={repoName}
                      onChange={(e) => {
                        setRepoName(e.target.value);
                        setSelectedRepo("");
                      }}
                    />
                    <button className="btn btn-sm" onClick={() => handleRepoClick(repoName)} disabled={!repoName}>
                      Select
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Local Folder Directory Binding (Grayed out by default until selectedRepo is present) */}
              <div style={{
                flex: 1.2,
                backgroundColor: "var(--color-bg-subtle)",
                border: "1px solid var(--color-border-default)",
                borderRadius: "8px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                transition: "opacity 0.2s",
                opacity: selectedRepo ? 1.0 : 0.4,
                pointerEvents: selectedRepo ? "auto" : "none",
              }}>
                {/* Visual Lock/Disabled Overlay */}
                {!selectedRepo && (
                  <div style={{
                    position: "absolute",
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(0, 0, 0, 0.15)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-fg-muted)",
                    fontSize: "13px",
                    fontWeight: 500,
                    padding: "24px",
                    textAlign: "center",
                    zIndex: 10,
                  }}>
                    Select a remote repository from the left panel to configure the cloning path.
                  </div>
                )}

                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>Clone & Install Repository</h3>
                  
                  <div style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginBottom: "20px" }}>
                    Selected remote: <strong style={{ color: "var(--color-fg-default)" }}>{repoName}</strong>
                  </div>

                  <div className="form-group" style={{ marginBottom: "16px" }}>
                    <label className="form-label" style={{ fontWeight: 500, fontSize: "12px" }}>Local Target Folder Path</label>
                    <input
                      type="text"
                      className="form-control"
                      value={targetPath}
                      onChange={(e) => setTargetPath(e.target.value)}
                      placeholder="/Users/username/project"
                      required
                    />
                    <span className="form-note">Must be an absolute directory path where the codebase will clone.</span>
                  </div>

                  {autoStatus === "idle" && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ width: "100%", padding: "10px", fontWeight: "600" }}
                      onClick={runAutomaticSetup}
                    >
                      Start Auto-Build & Install
                    </button>
                  )}

                  {autoStatus !== "idle" && (
                    <div style={{ border: "1px solid var(--color-border-default)", borderRadius: "6px", backgroundColor: "var(--color-bg-overlay)", padding: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        {autoStatus !== "success" && autoStatus !== "error" && <div className="spinner" style={{ width: "12px", height: "12px" }}></div>}
                        <span style={{ fontWeight: 600, fontSize: "12px" }}>
                          {autoStatus === "installing" && "Installing npm dependencies..."}
                          {autoStatus === "auditing" && "Fixing security vulnerabilities..."}
                          {autoStatus === "finishing" && "Finalizing workspace database..."}
                          {autoStatus === "success" && "Setup Completed!"}
                          {autoStatus === "error" && "Error during installation"}
                        </span>
                      </div>
                      <div style={{
                        maxHeight: "100px",
                        overflowY: "auto",
                        backgroundColor: "rgba(0,0,0,0.2)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        padding: "6px",
                        borderRadius: "4px",
                        color: "#8b949e",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}>
                        {autoLogs.map((log, idx) => (
                          <div key={idx}>{log}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {autoError && (
                    <div className="flash flash-danger" style={{ marginTop: "12px", fontSize: "12px" }}>
                      {autoError}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: "1px solid var(--color-border-default)", marginTop: "20px", paddingTop: "12px" }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setStep("profile-selection")}
                    disabled={autoStatus === "installing" || autoStatus === "auditing" || autoStatus === "finishing"}
                  >
                    Back to Workspaces
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEWPORT MODE 2: UNIFIED LOCAL DIRECTORY SCANNER CARD */}
          {setupMode === "local" && (
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
          )}
        </div>
      )}

      {/* SIMULATED OAUTH MODAL */}
      {isOauthModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div className="card" style={{ width: "480px", border: "1px solid var(--color-border-default)", boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}>
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg height="16" viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 15V9a4 4 0 0 0-4-4H9" />
                  <line x1="6" y1="9" x2="6" y2="15" />
                </svg>
                <span style={{ fontWeight: 600 }}>Authorize OmniSync GitHub App</span>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                style={{ border: "none", background: "none", color: "var(--color-fg-muted)", cursor: "pointer", fontSize: "14px" }}
                onClick={() => setIsOauthModalOpen(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="card-body" style={{ padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              {oauthStatus === "authenticating" ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "24px", marginBottom: "24px" }}>
                    <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: "1px solid var(--color-border-default)", backgroundColor: "var(--color-bg-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                      🧑‍💻
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-accent-fg)", animation: "spin 1s linear infinite" }}></span>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-fg-subtle)" }}></span>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-success-fg)" }}></span>
                    </div>
                    <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: "1px solid var(--color-border-default)", backgroundColor: "var(--color-bg-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                      ⚙️
                    </div>
                  </div>

                  <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>Request for Permissions</h3>
                  <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginBottom: "20px", maxWidth: "380px" }}>
                    OmniSync GitHub App is requesting permission to list public and private repositories, fetch branches, and view user details.
                  </p>

                  <div style={{ width: "100%", border: "1px solid var(--color-border-default)", borderRadius: "6px", padding: "12px", backgroundColor: "rgba(0,0,0,0.1)", textAlign: "left", fontSize: "12px", marginBottom: "24px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--color-success-fg)" }}>✓</span>
                      <span>Read repository metadata and trees</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--color-success-fg)" }}>✓</span>
                      <span>List remote branches and logs</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--color-success-fg)" }}>✓</span>
                      <span>Access public profile information</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                    <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setIsOauthModalOpen(false)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary" style={{ flex: 1.5, backgroundColor: "var(--color-btn-primary-bg)" }} onClick={handleOauthAuthorize}>
                      Authorize shockagg
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ padding: "16px 0" }}>
                  <div className="spinner" style={{ width: "32px", height: "32px", marginBottom: "16px" }}></div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-success-fg)" }}>Authorization Successful!</h3>
                  <p style={{ fontSize: "12px", color: "var(--color-fg-muted)", marginTop: "4px" }}>
                    Retrieving profile credentials from GitHub...
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
