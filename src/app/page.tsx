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

interface RepoCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
  isMerge: boolean;
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function DashboardPage() {
  const router = useAppRouter();
  const [activeTab, setActiveTab] = useState<"workspace" | "git" | "diagnostics" | "settings" | "timeline">("workspace");
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

  // Timeline state
  const [allCommits, setAllCommits] = useState<RepoCommit[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());

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

  const loadAllCommits = async () => {
    setIsTimelineLoading(true);
    try {
      const res = await fetch("/api/workspace/git?action=all-commits");
      const data = await res.json();
      setAllCommits((data.commits as RepoCommit[]) || []);
    } catch {} finally {
      setIsTimelineLoading(false);
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
      loadAllCommits();
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
            onClick={() => setActiveTab("timeline")}
            className={`sidebar-btn ${activeTab === "timeline" ? "active" : ""}`}
            title="Commit History Timeline Calendar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
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
              {/* Sidebar Git Status Controls */}
              <div style={{
                width: "320px",
                borderRight: "1px solid var(--color-border-default)",
                backgroundColor: "var(--color-bg-subtle)",
                padding: "24px 20px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                flexShrink: 0,
              }}>
                <div>
                  <h3 style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px", marginBottom: "12px" }}>
                    Repository Sync
                  </h3>
                  
                  <div className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", background: "rgba(22, 27, 34, 0.4)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
                      <span style={{ color: "var(--color-fg-muted)" }}>Upstream</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "var(--color-accent-fg)" }}>
                        {syncStatus.upstream ? syncStatus.upstream.split("/").pop() : "origin/main"}
                      </span>
                    </div>

                    {/* Visual Connection Map */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                        <span style={{ fontSize: "11px", fontWeight: 600 }}>Local</span>
                        <span style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontFamily: "var(--font-mono)" }}>{currentBranch}</span>
                      </div>
                      
                      <div style={{ display: "flex", alignItems: "center", flex: 2, position: "relative" }}>
                        <div style={{ height: "2px", backgroundColor: "var(--color-border-default)", flex: 1 }}></div>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          backgroundColor: "var(--color-bg-overlay)",
                          border: "1px solid var(--color-border-default)",
                          fontSize: "10px",
                          zIndex: 1,
                        }}>
                          ⇄
                        </div>
                        <div style={{ height: "2px", backgroundColor: "var(--color-border-default)", flex: 1 }}></div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                        <span style={{ fontSize: "11px", fontWeight: 600 }}>Upstream</span>
                        <span style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontFamily: "var(--font-mono)" }}>origin</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                        <span style={{ color: "var(--color-fg-muted)" }}>Ahead (Unpushed)</span>
                        <span className={`badge ${syncStatus.ahead > 0 ? "badge-warning" : ""}`} style={{ fontSize: "11px" }}>
                          {syncStatus.ahead} commits
                        </span>
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                        <span style={{ color: "var(--color-fg-muted)" }}>Behind (Unsynced)</span>
                        <span className={`badge ${syncStatus.behind > 0 ? "badge-danger" : ""}`} style={{ fontSize: "11px" }}>
                          {syncStatus.behind} commits
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px", marginBottom: "12px" }}>
                    Active Branches
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {branches.map((b) => {
                      const isActive = currentBranch === b;
                      return (
                        <div
                          key={b}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "6px",
                            fontSize: "13px",
                            backgroundColor: isActive ? "var(--color-accent-bg)" : "transparent",
                            border: `1px solid ${isActive ? "var(--color-accent-border)" : "var(--color-border-default)"}`,
                            fontWeight: isActive ? 600 : "normal",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            transition: "all 0.15s ease",
                            cursor: "default",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: isActive ? "var(--color-accent-fg)" : "var(--color-fg-muted)" }}>
                              <line x1="6" y1="3" x2="6" y2="15" />
                              <circle cx="18" cy="6" r="3" />
                              <circle cx="6" cy="18" r="3" />
                              <path d="M18 9a9 9 0 0 1-9 9" />
                            </svg>
                            <span>{b}</span>
                          </div>
                          {isActive && (
                            <span style={{
                              display: "inline-block",
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              backgroundColor: "#3fb950",
                              boxShadow: "0 0 8px #3fb950",
                            }}></span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px", marginBottom: "12px" }}>
                    Conflict Files
                  </h3>
                  {conflictFiles.length === 0 ? (
                    <div style={{
                      padding: "16px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(63, 185, 80, 0.05)",
                      color: "var(--color-success-fg)",
                      border: "1px solid var(--color-success-border)",
                      fontSize: "12px",
                      lineHeight: "18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}>
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>✓</span> No Conflicts
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>
                        Workspace codebase compiles clean without merge issues.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {conflictFiles.map((file) => {
                        const isSelected = selectedConflictFile === file;
                        return (
                          <div
                            key={file}
                            onClick={() => setSelectedConflictFile(file)}
                            style={{
                              padding: "10px 14px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              border: `1px solid ${isSelected ? "var(--color-danger-border)" : "var(--color-border-default)"}`,
                              backgroundColor: isSelected ? "var(--color-danger-bg)" : "rgba(248, 81, 73, 0.02)",
                              color: isSelected ? "var(--color-danger-fg)" : "var(--color-fg-default)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                            }}
                          >
                            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ color: "var(--color-danger-fg)" }}>⚡</span>
                              <span>{file.split("/").pop()}</span>
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--color-fg-muted)", wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>
                              {file}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Main Git Workspace Panel */}
              <div style={{ flex: 1, overflow: "hidden", backgroundColor: "var(--color-bg-default)" }}>
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
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    padding: "48px 24px",
                    textAlign: "center",
                    maxWidth: "600px",
                    margin: "0 auto",
                    gap: "24px",
                  }}>
                    <div style={{
                      width: "64px",
                      height: "64px",
                      borderRadius: "50%",
                      backgroundColor: "rgba(88, 166, 255, 0.05)",
                      border: "1px solid var(--color-border-default)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "24px",
                    }}>
                      🔀
                    </div>
                    
                    <div>
                      <h2 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px", margin: 0 }}>
                        Git Collaboration Workspace
                      </h2>
                      <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginTop: "8px", lineHeight: "20px" }}>
                        Manage local branch synchronization and resolve merge conflicts interactively. Click on an active conflict file from the left sidebar to open the resolver dashboard.
                      </p>
                    </div>

                    <div className="card" style={{ width: "100%", padding: "16px 20px", textAlign: "left", display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px" }}>
                        Repository Status Summary
                      </div>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
                        <div>
                          <div style={{ color: "var(--color-fg-muted)", fontSize: "11px" }}>Current Workspace Directory</div>
                          <div style={{ fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: "12px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {activeProfile?.workspacePath || "No path linked"}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: "var(--color-fg-muted)", fontSize: "11px" }}>Active Branch Node</div>
                          <div style={{ fontWeight: 600, marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#3fb950" }}></span>
                            {currentBranch}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSTICS DASHBOARD PANEL */}
          {activeTab === "diagnostics" && (
            <div className="animate-fade-slide" style={{
              flex: 1,
              padding: "32px",
              overflowY: "auto",
              backgroundColor: "var(--color-bg-default)",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              maxWidth: "1000px",
              margin: "0 auto",
              width: "100%",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h2 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px", margin: 0, color: "var(--color-fg-default)" }}>
                    Environment Diagnostics
                  </h2>
                  <span style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: isDiagLoading ? "var(--color-attention-fg)" : "#3fb950",
                    boxShadow: `0 0 8px ${isDiagLoading ? "var(--color-attention-fg)" : "#3fb950"}`,
                  }}></span>
                </div>
                <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginTop: "4px" }}>
                  Verify Node version engine limits, audit local module packages, and run automated script repairs.
                </p>
              </div>

              {isDiagLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "32px", backgroundColor: "var(--color-bg-subtle)", borderRadius: "8px", border: "1px solid var(--color-border-default)" }}>
                  <div className="spinner"></div>
                  <span style={{ fontSize: "13px", color: "var(--color-fg-muted)" }}>Scanning workspace directory packages and system environment variables...</span>
                </div>
              ) : diagData ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  {/* Bento Grid Stats Card row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: "16px" }}>
                    
                    {/* Node Engine Card */}
                    <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px", background: "rgba(22, 27, 34, 0.4)" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Node.js Runtime</div>
                        <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "8px", fontFamily: "var(--font-mono)" }}>{diagData.nodeVersion}</div>
                      </div>
                      <div style={{ marginTop: "12px" }}>
                        {diagData.isNodeCompatible ? (
                          <span className="badge badge-success" style={{ fontSize: "10px", padding: "3px 8px" }}>Compatible ({diagData.enginesNode})</span>
                        ) : (
                          <span className="badge badge-danger" style={{ fontSize: "10px", padding: "3px 8px" }}>Mismatch (Required: {diagData.enginesNode})</span>
                        )}
                      </div>
                    </div>

                    {/* npm Package Manager Card */}
                    <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px", background: "rgba(22, 27, 34, 0.4)" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>npm Package Manager</div>
                        <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "8px", fontFamily: "var(--font-mono)" }}>v{diagData.npmVersion}</div>
                      </div>
                      <div style={{ marginTop: "12px" }}>
                        <span className="badge badge-info" style={{ fontSize: "10px", padding: "3px 8px" }}>System Installed</span>
                      </div>
                    </div>

                    {/* Package Audit Progress Card */}
                    <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px", background: "rgba(22, 27, 34, 0.4)" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Dependencies Check</div>
                        <div style={{ fontSize: "13px", marginTop: "8px" }}>
                          Total dependencies: <strong>{diagData.totalDependencies}</strong> packages
                        </div>
                      </div>
                      
                      <div style={{ marginTop: "12px" }}>
                        {diagData.missingDependencies.length === 0 ? (
                          <div style={{
                            fontSize: "11px",
                            color: "var(--color-success-fg)",
                            backgroundColor: "rgba(63, 185, 80, 0.05)",
                            border: "1px solid var(--color-success-border)",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            display: "inline-block",
                            fontWeight: 600,
                          }}>
                            ✓ node_modules clean
                          </div>
                        ) : (
                          <div style={{
                            fontSize: "11px",
                            color: "var(--color-danger-fg)",
                            backgroundColor: "rgba(248, 81, 73, 0.05)",
                            border: "1px solid var(--color-danger-border)",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            display: "inline-block",
                            fontWeight: 600,
                          }}>
                            ⚠️ {diagData.missingDependencies.length} package folders missing
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Terminal Console and Action Buttons */}
                  <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "600" }}>Diagnostics & Repair Console</span>
                      {isActionLoading && <div className="spinner" style={{ width: "12px", height: "12px" }}></div>}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", minHeight: "260px" }}>
                      
                      {/* Left: action triggers column */}
                      <div style={{
                        padding: "20px",
                        borderRight: "1px solid var(--color-border-default)",
                        backgroundColor: "var(--color-bg-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px", marginBottom: "4px" }}>
                          Available Commands
                        </div>
                        
                        <button
                          className="btn"
                          disabled={isActionLoading}
                          onClick={() => handleMaintenanceAction("clean-cache")}
                          style={{ textAlign: "left", padding: "10px 14px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}
                        >
                          <span style={{ fontWeight: 600 }}>Clear npm Cache</span>
                          <span style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "normal" }}>Forces cleanup of the local npm build cache</span>
                        </button>
                        
                        <button
                          className="btn"
                          disabled={isActionLoading}
                          onClick={() => handleMaintenanceAction("audit-fix")}
                          style={{ textAlign: "left", padding: "10px 14px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}
                        >
                          <span style={{ fontWeight: 600 }}>Security Audit Fix</span>
                          <span style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "normal" }}>Audits local modules for vulnerabilities</span>
                        </button>
                        
                        <button
                          className="btn btn-danger"
                          disabled={isActionLoading}
                          onClick={() => handleMaintenanceAction("clean-modules")}
                          style={{ textAlign: "left", padding: "10px 14px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px", marginTop: "auto" }}
                        >
                          <span style={{ fontWeight: 600 }}>Reinstall node_modules</span>
                          <span style={{ fontSize: "10px", opacity: 0.8, fontWeight: "normal" }}>Deletes and recreates the target local packages</span>
                        </button>
                      </div>

                      {/* Right: Console logs output */}
                      <div style={{
                        backgroundColor: "#05080c",
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          flex: 1,
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          overflowY: "auto",
                          lineHeight: "20px",
                          color: "#8b949e",
                          maxHeight: "280px",
                        }}>
                          {actionOutput ? (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "6px", marginBottom: "10px", fontSize: "11px" }}>
                                <span style={{ color: "var(--color-fg-muted)" }}>terminal_stream.log</span>
                                <span className={`badge ${actionOutput.success ? "badge-success" : "badge-danger"}`}>
                                  {actionOutput.success ? "Exit Code: 0" : "Exit Code: 1"}
                                </span>
                              </div>
                              <pre style={{
                                margin: 0,
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                color: actionOutput.success ? "#e6edf3" : "var(--color-danger-fg)",
                                whiteSpace: "pre-wrap",
                              }}>
                                {actionOutput.output}
                              </pre>
                            </div>
                          ) : (
                            <div style={{ color: "var(--color-fg-subtle)", fontStyle: "italic", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>
                              $ compiler terminal ready. Select a maintenance command to view console output.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "13px", color: "var(--color-fg-muted)", padding: "16px", textAlign: "center" }}>
                  Environment diagnostics data unavailable.
                </div>
              )}
            </div>
          )}

          {/* TAB 5: COMMIT HISTORY TIMELINE CALENDAR PANEL */}
          {activeTab === "timeline" && (
            <div className="animate-fade-slide" style={{
              flex: 1,
              padding: "32px",
              overflowY: "auto",
              backgroundColor: "var(--color-bg-default)",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              maxWidth: "1100px",
              margin: "0 auto",
              width: "100%",
            }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px", margin: 0, color: "var(--color-fg-default)" }}>
                  Repository Commit Timeline Calendar
                </h2>
                <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginTop: "4px" }}>
                  A visual overview of commits, merges, and pushes mapped onto a calendar layout.
                </p>
              </div>

              {isTimelineLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "32px", backgroundColor: "var(--color-bg-subtle)", borderRadius: "8px", border: "1px solid var(--color-border-default)" }}>
                  <div className="spinner"></div>
                  <span style={{ fontSize: "13px", color: "var(--color-fg-muted)" }}>Reading repository Git history records...</span>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: "24px", alignItems: "start" }}>
                  
                  {/* Left Column: Sleek Calendar Grid */}
                  <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    
                    {/* Calendar Month Selector Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            if (calendarMonth === 0) {
                              setCalendarMonth(11);
                              setCalendarYear((y) => y - 1);
                            } else {
                              setCalendarMonth((m) => m - 1);
                            }
                          }}
                          style={{ padding: "4px 8px" }}
                        >
                          &lt;
                        </button>
                        
                        <span style={{ fontSize: "16px", fontWeight: 700, minWidth: "140px", textAlign: "center" }}>
                          {MONTH_NAMES[calendarMonth]} {calendarYear}
                        </span>

                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            if (calendarMonth === 11) {
                              setCalendarMonth(0);
                              setCalendarYear((y) => y + 1);
                            } else {
                              setCalendarMonth((m) => m + 1);
                            }
                          }}
                          style={{ padding: "4px 8px" }}
                        >
                          &gt;
                        </button>
                      </div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            const today = new Date();
                            setCalendarYear(today.getFullYear());
                            setCalendarMonth(today.getMonth());
                          }}
                          style={{ fontSize: "11px", padding: "4px 10px" }}
                        >
                          Today
                        </button>
                        
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            if (allCommits.length === 0) return;
                            const oldest = allCommits[allCommits.length - 1];
                            if (oldest && oldest.date) {
                              const d = new Date(oldest.date);
                              setCalendarYear(d.getFullYear());
                              setCalendarMonth(d.getMonth());
                              setSelectedCalendarDate(oldest.date);
                            }
                          }}
                          style={{ fontSize: "11px", padding: "4px 10px" }}
                          title="Jump to the first commit of the repository"
                        >
                          Repo Start ⇤
                        </button>
                      </div>
                    </div>

                    {/* Weekday Labels Header */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", borderBottom: "1px solid var(--color-border-default)", paddingBottom: "8px" }}>
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                        <div key={dayName} style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-fg-muted)" }}>
                          {dayName}
                        </div>
                      ))}
                    </div>

                    {/* Grid days */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px", minHeight: "280px" }}>
                      {(() => {
                        const firstDayIdx = new Date(calendarYear, calendarMonth, 1).getDay();
                        const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                        const cells = [];

                        // Empty prefix cells
                        for (let i = 0; i < firstDayIdx; i++) {
                          cells.push(<div key={`empty-${i}`} style={{ opacity: 0.15 }}></div>);
                        }

                        // Day cells
                        for (let day = 1; day <= daysInMonth; day++) {
                          const dateString = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                          const dayCommits = allCommits.filter((c) => c.date === dateString);
                          const isSelected = selectedCalendarDate === dateString;
                          const hasCommits = dayCommits.length > 0;
                          const hasMerges = dayCommits.some((c) => c.isMerge);

                          cells.push(
                            <div
                              key={`day-${day}`}
                              onClick={() => setSelectedCalendarDate(dateString)}
                              style={{
                                border: `1px solid ${isSelected ? "var(--color-accent-border)" : "var(--color-border-default)"}`,
                                borderRadius: "6px",
                                padding: "8px",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "space-between",
                                minHeight: "56px",
                                backgroundColor: isSelected
                                  ? "var(--color-accent-bg)"
                                  : hasCommits
                                  ? "rgba(56, 139, 253, 0.05)"
                                  : "var(--color-bg-overlay)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                position: "relative",
                              }}
                            >
                              <span style={{
                                fontSize: "12px",
                                fontWeight: isSelected || hasCommits ? 700 : "normal",
                                color: isSelected
                                  ? "var(--color-accent-fg)"
                                  : hasCommits
                                  ? "var(--color-fg-default)"
                                  : "var(--color-fg-muted)",
                              }}>
                                {day}
                              </span>

                              {hasCommits && (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                                  <span className={`badge ${hasMerges ? "badge-danger" : "badge-success"}`} style={{ fontSize: "9px", padding: "1px 4px" }}>
                                    {dayCommits.length}
                                  </span>
                                  {hasMerges && <span style={{ fontSize: "8px", color: "var(--color-danger-fg)", fontWeight: "bold" }}>🔀</span>}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return cells;
                      })()}
                    </div>
                  </div>

                  {/* Right Column: Selected Date Activity Logs */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    
                    {/* Selected Date Header / Commit details card */}
                    <div className="card" style={{ padding: "20px", minHeight: "360px", display: "flex", flexDirection: "column" }}>
                      <div style={{ borderBottom: "1px solid var(--color-border-default)", paddingBottom: "12px", marginBottom: "16px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px" }}>
                          Timeline Activity Details
                        </div>
                        <h3 style={{ fontSize: "16px", fontWeight: 600, marginTop: "4px", color: "var(--color-fg-default)" }}>
                          {selectedCalendarDate ? (
                            new Date(selectedCalendarDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                          ) : (
                            "No Date Selected"
                          )}
                        </h3>
                      </div>

                      <div style={{ flex: 1, overflowY: "auto" }}>
                        {(() => {
                          if (!selectedCalendarDate) {
                            return (
                              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--color-fg-subtle)", fontStyle: "italic", textAlign: "center", fontSize: "12px", gap: "8px" }}>
                                <span>📅</span>
                                <span>Select any cell with green commit badges on the calendar grid to load details.</span>
                              </div>
                            );
                          }

                          const dateCommits = allCommits.filter((c) => c.date === selectedCalendarDate);
                          if (dateCommits.length === 0) {
                            return (
                              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-fg-subtle)", fontStyle: "italic", textAlign: "center", fontSize: "12px" }}>
                                No commits or repository modifications recorded on this date.
                              </div>
                            );
                          }

                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                              {dateCommits.map((c) => (
                                <div
                                  key={c.hash}
                                  style={{
                                    border: "1px solid var(--color-border-default)",
                                    borderRadius: "6px",
                                    padding: "12px",
                                    backgroundColor: "rgba(22, 27, 34, 0.4)",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "6px",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--color-accent-fg)", fontWeight: 600 }}>
                                      {c.hash.slice(0, 7)}
                                    </span>
                                    {c.isMerge ? (
                                      <span className="badge badge-danger" style={{ fontSize: "9px", padding: "1px 4px" }}>Merge</span>
                                    ) : (
                                      <span className="badge badge-success" style={{ fontSize: "9px", padding: "1px 4px" }}>Commit</span>
                                    )}
                                  </div>
                                  
                                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-fg-default)", lineHeight: "18px" }}>
                                    {c.subject}
                                  </div>
                                  
                                  <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                                    <span>Author: {c.author}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Quick Month Metrics Widget */}
                    <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px" }}>
                        Month Performance stats
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginTop: "4px" }}>
                        <span>Total commits this month:</span>
                        <strong style={{ color: "var(--color-accent-fg)" }}>
                          {allCommits.filter((c) => {
                            const d = new Date(c.date);
                            return d.getFullYear() === calendarYear && d.getMonth() === calendarMonth;
                          }).length}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
