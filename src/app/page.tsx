"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter as useAppRouter } from "next/navigation";
import FileTree, { FileNode } from "@/components/FileTree";
import CodeViewer from "@/components/CodeViewer";
import DiffViewer from "@/components/DiffViewer";
import ConflictResolver from "@/components/ConflictResolver";
import WorkspaceSettingsView from "@/components/WorkspaceSettingsView";
import { UserProfile } from "@/lib/profiles";
import { RunnerStatus } from "@/lib/runner";

interface SyncStatus {
  ahead: number;
  behind: number;
  upstream: string;
}

interface DiagnosticDetails {
  nodeVersion: string;
  npmVersion: string;
  enginesNode: string;
  isNodeCompatible: boolean;
  packageJsonExists: boolean;
  totalDependencies: number;
  missingDependencies: string[];
  gitStatus: string;
}

export default function DashboardPage() {
  const router = useAppRouter();
  const [activeTab, setActiveTab] = useState<"workspace" | "git" | "diagnostics" | "settings">("workspace");
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // Workspace state
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [fileContent, setFileContent] = useState("");
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState("main");
  const [isChangingBranch, setIsChangingBranch] = useState(false);

  // Runner state
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>({ status: "stopped", pid: null });
  const [runnerLogs, setRunnerLogs] = useState<string[]>([]);
  const [isRunnerLoading, setIsRunnerLoading] = useState(false);

  // Git Collaboration state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ ahead: 0, behind: 0, upstream: "" });
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [selectedConflictFile, setSelectedConflictFile] = useState<string | null>(null);

  // Diagnostics state
  const [diagData, setDiagData] = useState<DiagnosticDetails | null>(null);
  const [isDiagLoading, setIsDiagLoading] = useState(false);
  const [actionOutput, setActionOutput] = useState<{ success: boolean; output: string } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Layout Resizing state
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(360);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Polling ref for logs
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Declaring functions before useEffect to avoid hoisting issues
  const loadWorkspaceFiles = async () => {
    try {
      const res = await fetch("/api/workspace/files");
      const data = await res.json();
      setFileTree((data.tree as FileNode[]) || []);
    } catch {}
  };

  const loadGitBranches = async () => {
    try {
      const res = await fetch("/api/workspace/git?action=branches");
      const data = await res.json();
      setBranches((data.branches as string[]) || ["main"]);
      setCurrentBranch(data.current || "main");
    } catch {}
  };

  const loadGitSyncStatus = async () => {
    try {
      const res = await fetch("/api/workspace/git?action=status");
      const data = await res.json();
      setSyncStatus((data.sync as SyncStatus) || { ahead: 0, behind: 0, upstream: "" });
    } catch {}
  };

  const loadConflictFiles = async () => {
    try {
      const res = await fetch("/api/workspace/git?action=conflicts");
      const data = await res.json();
      setConflictFiles((data.conflicts as string[]) || []);
    } catch {}
  };

  const loadDiagnostics = async () => {
    Promise.resolve().then(() => {
      setIsDiagLoading(true);
      setActionOutput(null);
    });
    try {
      const res = await fetch("/api/workspace/diagnostics");
      const data = await res.json();
      setDiagData(data as DiagnosticDetails);
    } catch {} finally {
      setIsDiagLoading(false);
    }
  };

  // 1. Fetch Profile details first
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/profiles");
        const data = await res.json();
        if (!data.activeProfileId || data.profiles.length === 0) {
          router.push("/setup");
          return;
        }
        const active = (data.profiles as UserProfile[]).find((p) => p.id === data.activeProfileId);
        if (!active || !active.workspacePath) {
          router.push("/setup");
          return;
        }
        setActiveProfile(active);
      } catch {
        router.push("/setup");
      } finally {
        setIsLoadingProfile(false);
      }
    }
    loadProfile();
  }, [router]);

  // 2. Load Workspace details once profile is loaded
  useEffect(() => {
    if (!activeProfile) return;

    Promise.resolve().then(() => {
      loadWorkspaceFiles();
      loadGitBranches();
      loadGitSyncStatus();
      loadConflictFiles();
    });
  }, [activeProfile]);

  // 3. Poll runner logs and status while running
  useEffect(() => {
    async function checkRunner() {
      try {
        const res = await fetch("/api/workspace/runner");
        const data = await res.json();
        if (data && data.status) {
          setRunnerStatus(data.status as RunnerStatus);
        }
        if (data && data.logs) {
          setRunnerLogs((data.logs as string[]) || []);
        }
      } catch {}
    }

    checkRunner();
    
    pollIntervalRef.current = setInterval(checkRunner, 3000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // 4. Load selected file content
  useEffect(() => {
    if (!activeFile) {
      Promise.resolve().then(() => {
        setFileContent("");
      });
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      if (active) setIsFileLoading(true);
    }, 150); // Debounce: only show spinner/loading if the load takes > 150ms

    async function loadFileContent() {
      try {
        const res = await fetch(`/api/workspace/file-content?file=${encodeURIComponent(activeFile!)}`);
        const data = await res.json();
        if (active) {
          if (data.error) {
            setFileContent(`Error loading file: ${data.error}`);
          } else {
            setFileContent(data.content || "");
          }
        }
      } catch (e: unknown) {
        if (active) {
          const msg = e instanceof Error ? e.message : String(e);
          setFileContent(`Error loading file: ${msg}`);
        }
      } finally {
        clearTimeout(timer);
        if (active) {
          setIsFileLoading(false);
        }
      }
    }

    loadFileContent();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeFile]);

  // Handlers for multiple file tabs
  const handleSelectFile = (file: string) => {
    setOpenFiles((prev) => {
      if (prev.includes(file)) return prev;
      return [...prev, file];
    });
    setActiveFile(file);
  };

  const handleCloseFile = (fileToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenFiles((prev) => {
      const updated = prev.filter((f) => f !== fileToClose);
      if (activeFile === fileToClose) {
        setActiveFile(updated.length > 0 ? updated[updated.length - 1] : null);
      }
      return updated;
    });
  };

  // Handle layout resizing interactions
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(150, Math.min(450, e.clientX));
        setLeftWidth(newWidth);
      }
      if (isResizingRight) {
        const newWidth = Math.max(200, Math.min(600, window.innerWidth - e.clientX));
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight]);

  const startResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingLeft(true);
  };

  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRight(true);
  };

  // Handle Tab Change side-effects
  useEffect(() => {
    if (activeTab === "diagnostics") {
      Promise.resolve().then(() => {
        loadDiagnostics();
      });
    }
  }, [activeTab]);

  const handleBranchChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const branch = e.target.value;
    setIsChangingBranch(true);
    try {
      const res = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch-branch", branch }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentBranch(data.current);
        loadWorkspaceFiles();
        setActiveFile(null);
      } else {
        alert(`Failed to switch branch: ${data.error}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Error switching branch: ${msg}`);
    } finally {
      setIsChangingBranch(false);
    }
  };

  // Spawning development servers
  const handleToggleRunner = async () => {
    setIsRunnerLoading(true);
    const action = runnerStatus?.status === "running" || runnerStatus?.status === "starting" ? "stop" : "start";
    try {
      const res = await fetch("/api/workspace/runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data && data.success && data.status) {
        setRunnerStatus(data.status as RunnerStatus);
      }
    } catch {} finally {
      setIsRunnerLoading(false);
    }
  };

  // Run diagnostics maintenance tasks
  const handleMaintenanceAction = async (action: string) => {
    setIsActionLoading(true);
    setActionOutput(null);
    try {
      const res = await fetch("/api/workspace/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setActionOutput(data as { success: boolean; output: string });
      loadDiagnostics();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionOutput({ success: false, output: msg });
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "var(--color-bg-default)", gap: "16px" }}>
        <div className="spinner animate-pulse-glow" style={{ width: "40px", height: "40px" }}></div>
        <div className="animate-pulse" style={{ color: "var(--color-fg-muted)", fontSize: "14px", fontWeight: "500", letterSpacing: "-0.2px" }}>
          Synchronizing Workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Top Banner Header */}
      <header className="header">
        <div className="header-brand">
          <svg height="20" viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.73-2.79" />
          </svg>
          <span style={{ fontSize: "14px", fontWeight: "600" }}>OmniSync Workspace</span>
          <span className="badge badge-info" style={{ fontSize: "10px", marginLeft: "4px" }}>
            {activeProfile?.workspaceType === "automatic" ? "Auto Setup" : "Manual Repo"}
          </span>
        </div>

        {/* Profile Card Header Info */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600, color: "var(--color-header-text)" }}>{activeProfile?.name}</div>
            <div style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>{activeProfile?.profession}</div>
          </div>
          
          <button className="btn btn-sm" onClick={() => {
            router.push("/setup");
          }}>
            Switch Workspace
          </button>
        </div>
      </header>

      {/* Main Core Layout */}
      <div className="main-layout">
        {/* Leftmost Sidebar tabs */}
        <nav className="sidebar">
          <button
            onClick={() => setActiveTab("workspace")}
            className={`sidebar-btn ${activeTab === "workspace" ? "active" : ""}`}
            title="Code Workspace"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>
 
          <button
            onClick={() => setActiveTab("git")}
            className={`sidebar-btn ${activeTab === "git" ? "active" : ""}`}
            title="Git Collaboration & Merges"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          </button>
 
          <button
            onClick={() => setActiveTab("diagnostics")}
            className={`sidebar-btn ${activeTab === "diagnostics" ? "active" : ""}`}
            title="Diagnostics Dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </button>
 
          <button
            onClick={() => setActiveTab("settings")}
            className={`sidebar-btn ${activeTab === "settings" ? "active" : ""}`}
            title="Workspace Settings"
            style={{ marginTop: "auto" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </nav>

        {/* Tab views switcher panels */}
        <main className="content-pane">
          {/* TAB 1: CODE WORKSPACE VIEW */}
          {activeTab === "workspace" && (
            <div className="animate-fade-slide" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
              {/* Top Control Bar */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 16px",
                borderBottom: "1px solid var(--color-border-default)",
                backgroundColor: "var(--color-bg-subtle)",
                flexShrink: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    onClick={handleToggleRunner}
                    disabled={isRunnerLoading}
                    className={`btn ${runnerStatus?.status === "running" || runnerStatus?.status === "starting" ? "btn-danger" : "btn-primary"}`}
                    style={{ minWidth: "120px" }}
                  >
                    {isRunnerLoading ? (
                      <div className="spinner" style={{ width: "12px", height: "12px" }}></div>
                    ) : runnerStatus?.status === "running" || runnerStatus?.status === "starting" ? (
                      <>
                        <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "white", marginRight: "4px" }}></span>
                        Stop Server
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "4px" }}>
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Run Server
                      </>
                    )}
                  </button>

                  <div style={{ fontSize: "12px", color: "var(--color-fg-muted)" }}>
                    {runnerStatus?.status === "running" && <span style={{ color: "var(--color-success-fg)", fontWeight: 600 }}>Active (PID: {runnerStatus?.pid})</span>}
                    {runnerStatus?.status === "starting" && <span style={{ color: "var(--color-attention-fg)" }}>Starting...</span>}
                    {runnerStatus?.status === "stopped" && <span>Dev Server Stopped</span>}
                    {runnerStatus?.status === "error" && <span style={{ color: "var(--color-danger-fg)" }}>Error: {runnerStatus?.error}</span>}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--color-fg-muted)" }}>Active Branch:</span>
                  <select
                    className="form-control"
                    style={{ width: "150px", padding: "3px 8px", fontSize: "13px" }}
                    value={currentBranch}
                    onChange={handleBranchChange}
                    disabled={isChangingBranch}
                  >
                    {branches.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Three Column View */}
              <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                {/* Column 1: Left file tree */}
                <div style={{
                  width: `${leftWidth}px`,
                  backgroundColor: "var(--color-bg-subtle)",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  flexShrink: 0,
                }}>
                  <div style={{ padding: "12px 16px 4px 16px", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "var(--color-fg-muted)" }}>
                    Workspace Files
                  </div>
                  <FileTree
                    tree={fileTree}
                    selectedFile={activeFile}
                    onSelectFile={(f) => {
                      setSelectedConflictFile(null);
                      handleSelectFile(f);
                    }}
                  />
                </div>

                {/* Left resizer vertical bar */}
                <div
                  onMouseDown={startResizeLeft}
                  style={{
                    width: "4px",
                    cursor: "col-resize",
                    backgroundColor: isResizingLeft ? "var(--color-accent-fg)" : "transparent",
                    borderLeft: "1px solid var(--color-border-default)",
                    borderRight: "1px solid var(--color-border-default)",
                    transition: "background-color 0.15s",
                    zIndex: 10,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!isResizingLeft) e.currentTarget.style.backgroundColor = "var(--color-border-default)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isResizingLeft) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                />

                {/* Column 2: Code Viewer with Tabs */}
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {/* VS Code Style Tab Bar */}
                  {openFiles.length > 0 && (
                    <div style={{
                      display: "flex",
                      backgroundColor: "var(--color-bg-subtle)",
                      borderBottom: "1px solid var(--color-border-default)",
                      overflowX: "auto",
                      flexShrink: 0,
                    }}>
                      {openFiles.map((file) => {
                        const isActive = file === activeFile;
                        const fileName = file.split("/").pop() || file;
                        return (
                          <div
                            key={file}
                            onClick={() => handleSelectFile(file)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 16px",
                              fontSize: "12px",
                              fontWeight: isActive ? 600 : 400,
                              color: isActive ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                              backgroundColor: isActive ? "var(--color-bg-default)" : "transparent",
                              borderRight: "1px solid var(--color-border-default)",
                              cursor: "pointer",
                              userSelect: "none",
                              borderTop: isActive ? "2px solid var(--color-accent-fg)" : "2px solid transparent",
                              position: "relative",
                              transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                            }}
                          >
                            <span>{fileName}</span>
                            <button
                              onClick={(e) => handleCloseFile(file, e)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--color-fg-muted)",
                                cursor: "pointer",
                                fontSize: "11px",
                                padding: "2px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "4px",
                                transition: "all 0.1s",
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-bg-active)"}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <CodeViewer
                      filePath={activeFile || ""}
                      content={fileContent}
                      isLoading={isFileLoading}
                    />
                  </div>
                </div>

                {/* Right resizer vertical bar */}
                <div
                  onMouseDown={startResizeRight}
                  style={{
                    width: "4px",
                    cursor: "col-resize",
                    backgroundColor: isResizingRight ? "var(--color-accent-fg)" : "transparent",
                    borderLeft: "1px solid var(--color-border-default)",
                    borderRight: "1px solid var(--color-border-default)",
                    transition: "background-color 0.15s",
                    zIndex: 10,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!isResizingRight) e.currentTarget.style.backgroundColor = "var(--color-border-default)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isResizingRight) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                />

                {/* Column 3: Commit Diff history */}
                <div style={{
                  width: `${rightWidth}px`,
                  overflow: "hidden",
                  flexShrink: 0,
                }}>
                  <DiffViewer selectedFile={activeFile} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GIT COLLABORATION AND CONFLICTS PANEL */}
          {activeTab === "git" && (
            <div className="animate-fade-slide" style={{ display: "flex", height: "100%", overflow: "hidden" }}>
              <div style={{
                width: "280px",
                borderRight: "1px solid var(--color-border-default)",
                backgroundColor: "var(--color-bg-subtle)",
                padding: "16px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}>
                <div>
                  <h3 style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "var(--color-fg-muted)", marginBottom: "8px" }}>
                    Synchronization Status
                  </h3>
                  <div className="card" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
                    <div>Active upstream: <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>{syncStatus.upstream || "no upstream"}</span></div>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <span className={`badge ${syncStatus.ahead > 0 ? "badge-warning" : ""}`}>
                        {syncStatus.ahead} commits ahead
                      </span>
                      <span className={`badge ${syncStatus.behind > 0 ? "badge-danger" : ""}`}>
                        {syncStatus.behind} commits behind
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "var(--color-fg-muted)", marginBottom: "8px" }}>
                    Active Branches
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {branches.map((b) => (
                      <div
                        key={b}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          backgroundColor: currentBranch === b ? "var(--color-accent-bg)" : "transparent",
                          border: `1px solid ${currentBranch === b ? "var(--color-accent-border)" : "transparent"}`,
                          fontWeight: currentBranch === b ? 600 : "normal",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>{b}</span>
                        {currentBranch === b && <span className="badge badge-success" style={{ fontSize: "9px", padding: "1px 4px" }}>Active</span>}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "var(--color-fg-muted)", marginBottom: "8px" }}>
                    Active Merge Conflicts
                  </h3>
                  {conflictFiles.length === 0 ? (
                    <div style={{
                      padding: "12px",
                      borderRadius: "6px",
                      backgroundColor: "var(--color-success-bg)",
                      color: "var(--color-success-fg)",
                      border: "1px solid var(--color-success-border)",
                      fontSize: "12px",
                    }}>
                      No merge conflicts detected in this repository.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {conflictFiles.map((file) => (
                        <div
                          key={file}
                          onClick={() => setSelectedConflictFile(file)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            border: `1px solid ${selectedConflictFile === file ? "var(--color-danger-border)" : "var(--color-border-default)"}`,
                            backgroundColor: selectedConflictFile === file ? "var(--color-danger-bg)" : "var(--color-bg-overlay)",
                            color: selectedConflictFile === file ? "var(--color-danger-fg)" : "var(--color-fg-default)",
                            cursor: "pointer",
                            transition: "all 0.1s",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{file.split("/").pop()}</div>
                          <div style={{ fontSize: "10px", color: "var(--color-fg-muted)", wordBreak: "break-all" }}>{file}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, overflow: "hidden" }}>
                {selectedConflictFile ? (
                  <ConflictResolver
                    relativeFile={selectedConflictFile}
                    onResolved={() => {
                      setSelectedConflictFile(null);
                      loadConflictFiles();
                      loadWorkspaceFiles();
                    }}
                  />
                ) : (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "var(--color-fg-muted)",
                    fontSize: "14px",
                    padding: "24px",
                    textAlign: "center",
                  }}>
                    Select an active merge conflict file from the left sidebar to load the visual 3-pane resolver editor.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSTICS DASHBOARD PANEL */}
          {activeTab === "diagnostics" && (
            <div className="animate-fade-slide" style={{ display: "flex", height: "100%", overflow: "hidden" }}>
              <div style={{
                flex: 1.2,
                borderRight: "1px solid var(--color-border-default)",
                padding: "24px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "24px",
              }}>
                <h2 style={{ fontSize: "18px", fontWeight: "600", letterSpacing: "-0.5px" }}>
                  Deterministic Environment Scanner
                </h2>

                {isDiagLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="spinner"></div>
                    <span>Checking machine host versions and dependency folders...</span>
                  </div>
                ) : diagData ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div className="card" style={{ padding: "16px" }}>
                        <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", fontWeight: "600", textTransform: "uppercase" }}>Node.js Engine Version</div>
                        <div style={{ fontSize: "20px", fontWeight: "600", marginTop: "4px" }}>{diagData.nodeVersion}</div>
                        <div style={{ marginTop: "8px" }}>
                          {diagData.isNodeCompatible ? (
                            <span className="badge badge-success">Compatible ({diagData.enginesNode})</span>
                          ) : (
                            <span className="badge badge-danger">Mismatch (Required: {diagData.enginesNode})</span>
                          )}
                        </div>
                      </div>

                      <div className="card" style={{ padding: "16px" }}>
                        <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", fontWeight: "600", textTransform: "uppercase" }}>npm Version</div>
                        <div style={{ fontSize: "20px", fontWeight: "600", marginTop: "4px" }}>v{diagData.npmVersion}</div>
                        <div style={{ marginTop: "8px" }}>
                          <span className="badge badge-info">Stable Installed</span>
                        </div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-header">Dependencies Audit</div>
                      <div className="card-body" style={{ fontSize: "13px" }}>
                        <div>Total requirements in package.json: <strong style={{ fontSize: "14px" }}>{diagData.totalDependencies}</strong> packages</div>
                        
                        <div style={{ marginTop: "12px" }}>
                          {diagData.missingDependencies.length === 0 ? (
                            <div className="flash flash-success" style={{ margin: 0 }}>
                              No missing local folders. All dependencies present in node_modules directory.
                            </div>
                          ) : (
                            <div className="flash flash-danger" style={{ margin: 0 }}>
                              {diagData.missingDependencies.length} package folders are missing! Development environment is broken. Please run &quot;Reinstall Modules&quot;.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 style={{ fontSize: "13px", fontWeight: "600", marginBottom: "8px" }}>One-Click Maintenance Tools</h3>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button
                          className="btn"
                          disabled={isActionLoading}
                          onClick={() => handleMaintenanceAction("clean-cache")}
                        >
                          Clear npm Cache
                        </button>
                        <button
                          className="btn btn-danger"
                          disabled={isActionLoading}
                          onClick={() => handleMaintenanceAction("clean-modules")}
                        >
                          Reinstall node_modules
                        </button>
                        <button
                          className="btn"
                          disabled={isActionLoading}
                          onClick={() => handleMaintenanceAction("audit-fix")}
                        >
                          Security Audit Fix
                        </button>
                      </div>
                    </div>

                    {actionOutput && (
                      <div className="card">
                        <div className="card-header" style={{ fontSize: "12px", padding: "8px 12px" }}>
                          <span>Action console output</span>
                          <span className={`badge ${actionOutput.success ? "badge-success" : "badge-danger"}`}>
                            {actionOutput.success ? "Success" : "Failed"}
                          </span>
                        </div>
                        <pre style={{
                          margin: 0,
                          padding: "12px",
                          backgroundColor: "rgba(0,0,0,0.3)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          color: "#c9d1d9",
                          maxHeight: "180px",
                          overflowY: "auto",
                          whiteSpace: "pre-wrap",
                        }}>
                          {actionOutput.output}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>Diagnostics details unavailable.</div>
                )}
              </div>

              <div style={{
                flex: 1,
                backgroundColor: "var(--color-bg-subtle)",
                borderLeft: "1px solid var(--color-border-default)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}>
                <div style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border-default)",
                  backgroundColor: "var(--color-bg-overlay)",
                  fontWeight: 600,
                  fontSize: "13px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <span>Background Server Console Output Logs</span>
                  <span className={`badge ${runnerStatus?.status === "running" ? "badge-success" : "badge-warning"}`}>
                    {runnerStatus?.status}
                  </span>
                </div>

                <div style={{
                  flex: 1,
                  padding: "16px",
                  backgroundColor: "#05080c",
                  color: "#e6edf3",
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  overflowY: "auto",
                  lineHeight: "20px",
                }}>
                  {runnerLogs.length === 0 ? (
                    <div style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}>
                      No active logs. Click &quot;Run Server&quot; in the Workspace tab to start live compiler output streaming.
                    </div>
                  ) : (
                    runnerLogs.map((log, idx) => (
                      <div key={idx} style={{
                        color: log.includes("[ERROR]") ? "var(--color-danger-fg)" : "inherit",
                        whiteSpace: "pre-wrap",
                      }}>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: WORKSPACE SETTINGS PANEL */}
          {activeTab === "settings" && (
            <WorkspaceSettingsView
              activeProfile={activeProfile}
              onProfileUpdated={(updatedProfile) => {
                setActiveProfile(updatedProfile);
                loadWorkspaceFiles();
                loadGitBranches();
                loadGitSyncStatus();
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
