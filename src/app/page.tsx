"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter as useAppRouter } from "next/navigation";
import FileTree, { FileNode } from "@/components/FileTree";
import CodeViewer from "@/components/CodeViewer";
import DiffViewer from "@/components/DiffViewer";
import ConflictResolver from "@/components/ConflictResolver";
import WorkspaceSettingsView from "@/components/WorkspaceSettingsView";
import { UserProfile } from "@/lib/profiles";
import Tooltip from "@/components/Tooltip";
import ProductTour from "@/components/ProductTour";
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
  projectName?: string;
  projectVersion?: string;
  projectDescription?: string;
  projectLicense?: string;
  username?: string;
  hostname?: string;
  folderName?: string;
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
  const [tourOpen, setTourOpen] = useState(false);
  const [isIdeDropdownOpen, setIsIdeDropdownOpen] = useState(false);
  const [showGuideTourButton, setShowGuideTourButton] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (localStorage.getItem("omnisync_hide_tour_button") === "true") {
        setShowGuideTourButton(false);
      }
    }
  }, []);

  const handleDismissTourButton = () => {
    setShowGuideTourButton(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("omnisync_hide_tour_button", "true");
    }
  };

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
  const [branchProtected, setBranchProtected] = useState(false);
  const [autoFetchIntervalMinutes, setAutoFetchIntervalMinutes] = useState(0);
  const [isGitSyncing, setIsGitSyncing] = useState<"fetch" | "pull" | "push" | null>(null);
  const [gitSyncError, setGitSyncError] = useState<string | null>(null);
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [selectedConflictFile, setSelectedConflictFile] = useState<string | null>(null);

  // Diagnostics state
  const [diagData, setDiagData] = useState<DiagnosticDetails | null>(null);
  const [isDiagLoading, setIsDiagLoading] = useState(false);
  const [actionOutput, setActionOutput] = useState<{ success: boolean; output: string } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "info" | "success" | "error" } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const dismissToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast(null);
  };

  const showNotification = (message: string, type: "info" | "success" | "error" = "info", duration = 4000) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }

    // 1. Try showing a system notification first
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new window.Notification("OmniSync", {
          body: message,
        });
        setToast(null);
        return;
      } catch (err) {
        console.error("System notification failed, falling back to toast:", err);
      }
    }

    // 2. Fallback: Show internal redesigned toast
    setToast({ message, type });

    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, duration);
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  const [launchOptions, setLaunchOptions] = useState<string[]>([]);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [isLiveTerminalActive, setIsLiveTerminalActive] = useState(false);
  const liveTerminalEndRef = useRef<HTMLDivElement | null>(null);

  type DependencyInstallPhase = "installing" | "success" | "error";
  interface DependencyInstallModalState {
    phase: DependencyInstallPhase;
    missingCount: number;
    missingPackages: string[];
    logs: string[];
    error?: string;
  }
  const [depInstallModal, setDepInstallModal] = useState<DependencyInstallModalState | null>(null);
  const depInstallLogEndRef = useRef<HTMLDivElement | null>(null);

  // Timeline state
  const [allCommits, setAllCommits] = useState<RepoCommit[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [isYearlyCalendarExpanded, setIsYearlyCalendarExpanded] = useState(true);

  // Helper for contribution calendar dates formatting
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Generate contribution calendar days for the current calendarYear (Jan 1 to Dec 31)
  const contributionDays = useMemo(() => {
    const days = [];
    const jan1 = new Date(calendarYear, 0, 1);
    const startDayOfWeek = jan1.getDay();
    const start = new Date(jan1);
    start.setDate(jan1.getDate() - startDayOfWeek); // Sunday of Jan 1st week

    const dec31 = new Date(calendarYear, 11, 31);
    const endDayOfWeek = dec31.getDay();
    const end = new Date(dec31);
    end.setDate(dec31.getDate() + (6 - endDayOfWeek)); // Saturday of Dec 31st week

    const curr = new Date(start);
    while (curr <= end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [calendarYear]);

  // Map dates to commit counts
  const commitCountsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    allCommits.forEach((commit) => {
      if (commit.date) {
        counts[commit.date] = (counts[commit.date] || 0) + 1;
      }
    });
    return counts;
  }, [allCommits]);

  // Calculate total commits in the calendar year (excluding boundary dates from other years)
  const totalCommitsLastYear = useMemo(() => {
    let total = 0;
    contributionDays.forEach((date) => {
      if (date.getFullYear() === calendarYear) {
        const dateString = formatLocalDate(date);
        total += commitCountsByDate[dateString] || 0;
      }
    });
    return total;
  }, [contributionDays, commitCountsByDate, calendarYear]);

  // Determine starting column for each month label
  const monthLabels = useMemo(() => {
    const labels: { text: string; colIdx: number }[] = [];
    let prevMonth = -1;
    const numCols = Math.ceil(contributionDays.length / 7);
    for (let colIdx = 0; colIdx < numCols; colIdx++) {
      const dayIndex = colIdx * 7;
      if (dayIndex < contributionDays.length) {
        const date = contributionDays[dayIndex];
        // Treat boundary days of previous/next years as current year Jan/Dec respectively
        const month = date.getFullYear() < calendarYear ? 0 : date.getFullYear() > calendarYear ? 11 : date.getMonth();
        if (month !== prevMonth) {
          labels.push({
            text: MONTH_NAMES[month].slice(0, 3),
            colIdx: colIdx,
          });
          prevMonth = month;
        }
      }
    }
    return labels;
  }, [contributionDays, calendarYear]);

  // Find the year of the oldest commit in the repository
  const repoStartYear = useMemo(() => {
    if (allCommits.length === 0) return new Date().getFullYear();
    const oldest = allCommits[allCommits.length - 1];
    if (oldest && oldest.date) {
      const d = new Date(oldest.date);
      if (!isNaN(d.getTime())) {
        return d.getFullYear();
      }
    }
    return new Date().getFullYear();
  }, [allCommits]);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const handleSquareClick = (dateString: string, date: Date) => {
    setSelectedCalendarDate(dateString);
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
  };

  const getContributionColor = (count: number) => {
    if (count === 0) return "var(--color-bg-active)";
    if (count <= 2) return "#0e4429";
    if (count <= 5) return "#006d32";
    if (count <= 9) return "#26a641";
    return "#39d353";
  };

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
      if (!res.ok) {
        showNotification(data.error || "Failed to load workspace files", "error");
        return;
      }
      setFileTree((data.tree as FileNode[]) || []);
    } catch {
      showNotification("Failed to load workspace files", "error");
    }
  };

  const loadGitBranches = async () => {
    try {
      const res = await fetch("/api/workspace/git?action=branches");
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error || "Failed to load branches", "error");
        return;
      }
      setBranches((data.branches as string[]) || []);
      setCurrentBranch(data.current || "main");
    } catch {
      showNotification("Failed to load branches", "error");
    }
  };

  const loadGitSyncStatus = async () => {
    try {
      const res = await fetch("/api/workspace/git?action=status");
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error || "Failed to load sync status", "error");
        return;
      }
      setSyncStatus((data.sync as SyncStatus) || { ahead: 0, behind: 0, upstream: "" });
      if (typeof data.branchProtected === "boolean") {
        setBranchProtected(data.branchProtected);
      }
      if (typeof data.autoFetchIntervalMinutes === "number") {
        setAutoFetchIntervalMinutes(data.autoFetchIntervalMinutes);
      }
    } catch {
      showNotification("Failed to load sync status", "error");
    }
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


  // Fetch launch configurations
  const loadLaunchOptions = async () => {
    try {
      const res = await fetch("/api/workspace/launch");
      const data = await res.json();
      setLaunchOptions(data.launchOptions || ["browser"]);
    } catch {
      setLaunchOptions(["browser"]);
    }
  };

  // Stream npm install output into modal + diagnostics terminal
  const streamInstallOutput = async (
    onLog: (message: string) => void
  ): Promise<void> => {
    const res = await fetch("/api/workspace/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "install" }),
    });

    if (!res.ok) {
      throw new Error("Install command failed to start");
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No install output stream received");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line) as { type?: string; message?: string };
          if (data.type === "error") {
            throw new Error(data.message || "Install failed");
          }
          if (data.type === "log" && data.message) {
            onLog(data.message);
          }
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }
  };

  const runDependencyInstall = async (missingPackages: string[]) => {
    const count = missingPackages.length;
    setDepInstallModal({
      phase: "installing",
      missingCount: count,
      missingPackages,
      logs: [`Detected ${count} missing package${count === 1 ? "" : "s"}. Running npm install...`],
    });
    setIsLiveTerminalActive(true);
    setDiagnosticLogs([]);

    const appendLog = (message: string) => {
      setDiagnosticLogs((prev) => [...prev, message]);
      setDepInstallModal((prev) =>
        prev ? { ...prev, logs: [...prev.logs, message] } : prev
      );
    };

    try {
      await streamInstallOutput(appendLog);

      setDepInstallModal((prev) =>
        prev ? { ...prev, phase: "success", logs: [...prev.logs, "All dependencies installed successfully."] } : prev
      );
      showNotification("Dependencies installed successfully!", "success");

      const reloadRes = await fetch("/api/workspace/diagnostics");
      const reloadData = await reloadRes.json();
      setDiagData(reloadData as DiagnosticDetails);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      appendLog(`Error: ${errMsg}`);
      setDepInstallModal((prev) =>
        prev ? { ...prev, phase: "error", error: errMsg } : prev
      );
      showNotification(`Dependency installation failed: ${errMsg}`, "error");
    } finally {
      setIsLiveTerminalActive(false);
    }
  };

  // Check for missing deps on workspace open and install with visible progress
  const checkAndInstallDependencies = async (diagnostics: DiagnosticDetails) => {
    if (diagnostics.missingDependencies && diagnostics.missingDependencies.length > 0) {
      await runDependencyInstall(diagnostics.missingDependencies);
    }
  };

  const handleLaunchTarget = async (type: string) => {
    const port = activeProfile?.port && activeProfile.port > 0 ? activeProfile.port : 3000;
    try {
      await fetch("/api/workspace/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, port }),
      });
      showNotification(
        `Launching ${type === "xcode" ? "Xcode Workspace" : type === "electron" ? "Electron App" : "Local Browser"}...`,
        "success",
        3000
      );
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      showNotification(`Launch failed: ${errMsg}`, "error", 4000);
    }
  };
  const handleLaunchIde = async (ideId: string, ideName: string) => {
    setIsIdeDropdownOpen(false);
    try {
      const res = await fetch("/api/workspace/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ide", ide: ideId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(`Successfully launched codebase in ${ideName}!`, "success", 3000);
      } else {
        showNotification(`Failed to launch ${ideName}: ${data.error || "Launch command error"}`, "error", 3000);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      showNotification(`Launch failed: ${errMsg}`, "error", 4000);
    }
  };
  // 2. Load Workspace details once profile is loaded
  useEffect(() => {
    if (!activeProfile) return;

    Promise.resolve().then(async () => {
      loadWorkspaceFiles();
      loadGitBranches();
      loadGitSyncStatus();
      loadConflictFiles();
      loadAllCommits();
      loadLaunchOptions();

      // Fetch diagnostics and check dependencies
      try {
        const res = await fetch("/api/workspace/diagnostics");
        const data = await res.json();
        setDiagData(data as DiagnosticDetails);
        checkAndInstallDependencies(data as DiagnosticDetails);
      } catch {}
    });
  }, [activeProfile]);

  // Background git fetch driven by workspace + global settings
  useEffect(() => {
    if (!activeProfile || activeProfile.autoFetch === false) return;
    if (!autoFetchIntervalMinutes || autoFetchIntervalMinutes <= 0) return;

    const intervalMs = autoFetchIntervalMinutes * 60 * 1000;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/workspace/git", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fetch" }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.sync) {
            setSyncStatus(data.sync as SyncStatus);
          } else {
            loadGitSyncStatus();
          }
        }
      } catch {}
    }, intervalMs);

    return () => clearInterval(timer);
  }, [activeProfile, activeProfile?.autoFetch, autoFetchIntervalMinutes]);

  // 3. Poll runner logs and status while running
  useEffect(() => {
    const isRunnerActive = runnerStatus?.status === "running" || runnerStatus?.status === "starting";
    if (!isRunnerActive) {
      return;
    }

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
        pollIntervalRef.current = null;
      }
    };
  }, [runnerStatus?.status]);

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
        if (typeof data.branchProtected === "boolean") {
          setBranchProtected(data.branchProtected);
        }
        loadWorkspaceFiles();
        setActiveFile(null);
        showNotification(`Switched to branch ${data.current}`, "success", 2500);
      } else {
        showNotification(data.error || "Failed to switch branch", "error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showNotification(`Error switching branch: ${msg}`, "error");
    } finally {
      setIsChangingBranch(false);
    }
  };

  const handleGitSync = async (action: "fetch" | "pull" | "push") => {
    setIsGitSyncing(action);
    setGitSyncError(null);
    try {
      const res = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data.error || `Git ${action} failed`;
        setGitSyncError(message);
        showNotification(message, "error");
        return;
      }
      if (data.sync) {
        setSyncStatus(data.sync as SyncStatus);
      } else {
        await loadGitSyncStatus();
      }
      await loadConflictFiles();
      await loadAllCommits();
      showNotification(`Git ${action} completed successfully`, "success", 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setGitSyncError(msg);
      showNotification(msg, "error");
    } finally {
      setIsGitSyncing(null);
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



  // Auto scroll live terminal to bottom
  useEffect(() => {
    if (liveTerminalEndRef.current) {
      liveTerminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [diagnosticLogs]);

  useEffect(() => {
    if (depInstallLogEndRef.current) {
      depInstallLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [depInstallModal?.logs]);

  // Run diagnostics maintenance tasks with live streaming
  const handleMaintenanceAction = async (action: string) => {
    setIsActionLoading(true);
    setIsLiveTerminalActive(true);
    setActionOutput(null);
    setDiagnosticLogs([]);

    try {
      const res = await fetch("/api/workspace/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        throw new Error("Maintenance action failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.type === "log") {
                setDiagnosticLogs((prev) => [...prev, data.message]);
              } else if (data.type === "error") {
                throw new Error(data.message);
              }
            } catch {}
          }
        }
      }

      setActionOutput({ success: true, output: "Command completed successfully." });
      loadDiagnostics();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setActionOutput({ success: false, output: msg });
    } finally {
      setIsActionLoading(false);
      setIsLiveTerminalActive(false);
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
      {/* Dependency install progress modal */}
      {depInstallModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(10, 12, 16, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99998,
            padding: "24px",
          }}
        >
          <div
            className="animate-fade-slide"
            style={{
              width: "100%",
              maxWidth: "520px",
              backgroundColor: "var(--color-bg-overlay)",
              border: "1px solid var(--color-border-default)",
              borderRadius: "12px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
              overflow: "hidden",
            }}
          >
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border-default)",
              backgroundColor: "var(--color-bg-subtle)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {depInstallModal.phase === "installing" && (
                  <div className="spinner" style={{ width: "16px", height: "16px", flexShrink: 0 }} />
                )}
                {depInstallModal.phase === "success" && (
                  <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-success-fg)" }}>check_circle</span>
                )}
                {depInstallModal.phase === "error" && (
                  <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-danger-fg)" }}>error</span>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--color-fg-default)" }}>
                    {depInstallModal.phase === "installing" && "Installing Dependencies"}
                    {depInstallModal.phase === "success" && "Dependencies Installed"}
                    {depInstallModal.phase === "error" && "Installation Failed"}
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-fg-muted)" }}>
                    {depInstallModal.missingCount} missing package{depInstallModal.missingCount === 1 ? "" : "s"} detected in this workspace
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {depInstallModal.phase === "installing" && (
                <div style={{
                  height: "4px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-bg-active)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: "40%",
                    borderRadius: "999px",
                    backgroundColor: "var(--color-accent-fg)",
                    animation: "depInstallProgress 1.2s ease-in-out infinite",
                  }} />
                </div>
              )}
              {depInstallModal.phase === "success" && (
                <div style={{
                  height: "4px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-success-fg)",
                }} />
              )}
              {depInstallModal.phase === "error" && (
                <div style={{
                  height: "4px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-danger-fg)",
                }} />
              )}

              {depInstallModal.missingPackages.length > 0 && depInstallModal.phase === "installing" && (
                <p style={{ margin: 0, fontSize: "11px", color: "var(--color-fg-muted)", fontFamily: "var(--font-mono)" }}>
                  {depInstallModal.missingPackages.slice(0, 6).join(", ")}
                  {depInstallModal.missingPackages.length > 6
                    ? ` +${depInstallModal.missingPackages.length - 6} more`
                    : ""}
                </p>
              )}

              <div style={{
                backgroundColor: "#090d13",
                border: "1px solid var(--color-border-default)",
                borderRadius: "8px",
                padding: "10px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "#8b949e",
                maxHeight: "180px",
                overflowY: "auto",
              }}>
                {depInstallModal.logs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                      color: log.startsWith("Error:") ? "var(--color-danger-fg)" : "#8b949e",
                    }}
                  >
                    {log}
                  </div>
                ))}
                <div ref={depInstallLogEndRef} />
              </div>

              {depInstallModal.phase === "error" && depInstallModal.error && (
                <p style={{ margin: 0, fontSize: "12px", color: "var(--color-danger-fg)" }}>
                  {depInstallModal.error}
                </p>
              )}
            </div>

            <div style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--color-border-default)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              backgroundColor: "var(--color-bg-subtle)",
            }}>
              {depInstallModal.phase === "error" && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => runDependencyInstall(depInstallModal.missingPackages)}
                >
                  Retry
                </button>
              )}
              {depInstallModal.phase !== "installing" && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setDepInstallModal(null)}
                >
                  {depInstallModal.phase === "success" ? "Continue" : "Dismiss"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-md right-md z-[99999] animate-fade-slide select-none" style={{ maxWidth: "360px" }}>
          <div style={{
            padding: "12px 18px",
            borderRadius: "10px",
            border: `1px solid ${
              toast.type === "success" ? "rgba(63, 185, 80, 0.4)" : toast.type === "error" ? "rgba(248, 81, 73, 0.4)" : "rgba(88, 166, 255, 0.4)"
            }`,
            backgroundColor: "rgba(22, 27, 34, 0.85)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
            color: "var(--color-fg-default)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            position: "relative",
            overflow: "hidden",
          }}>
            {toast.type === "info" && (
              <div className="w-4 h-4 border-2 border-[#58a6ff]/20 border-t-[#58a6ff] rounded-full animate-spin shrink-0"></div>
            )}
            {toast.type === "success" && (
              <span className="material-symbols-outlined text-[18px] text-[#3fb950] shrink-0" style={{ fontWeight: 700 }}>check_circle</span>
            )}
            {toast.type === "error" && (
              <span className="material-symbols-outlined text-[18px] text-[#f85149] shrink-0" style={{ fontWeight: 700 }}>error</span>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px" }}>
                {toast.type === "success" ? "Success" : toast.type === "error" ? "Error" : "System Notification"}
              </span>
              <span className="font-button-text font-semibold text-[13px]">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss notification"
              className="shrink-0 ml-auto p-1 rounded-md text-[var(--color-fg-muted)] hover:text-[var(--color-fg-default)] hover:bg-white/5 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>

            {/* Progress Bar */}
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              height: "3px",
              backgroundColor: toast.type === "success" ? "#3fb950" : toast.type === "error" ? "#f85149" : "#58a6ff",
              width: "100%",
              animation: "toastProgress 4.05s linear forwards",
            }} />
          </div>
        </div>
      )}

      {/* Top Banner Header */}
      <header className="header">
        <div className="header-brand">
          <img src="/icon.png" alt="Logo" style={{ height: "20px", width: "20px", objectFit: "contain", borderRadius: "4px" }} />
          <span style={{ fontSize: "14px", fontWeight: "600" }}>{activeProfile?.name || "OmniSync Workspace"}</span>
          <span className={`badge ${activeProfile?.hasGitToken ? "badge-success" : "badge-info"}`} style={{ fontSize: "10px", marginLeft: "4px" }}>
            {activeProfile?.hasGitToken ? "GitHub Connected" : "Local Only"}
          </span>
          {branchProtected && (
            <span className="badge badge-warning" style={{ fontSize: "10px" }} title="Direct commits to main/master are blocked">
              Branch Protected
            </span>
          )}
        </div>

        {/* Profile Card Header Info */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 600, color: "var(--color-header-text)" }}>{activeProfile?.name}</div>
            <div style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>{activeProfile?.profession}</div>
          </div>

          {showGuideTourButton && (
            <div style={{ display: "flex", alignItems: "center", gap: "2px", backgroundColor: "rgba(88, 166, 255, 0.15)", borderRadius: "6px", padding: "2px", border: "1px solid var(--color-accent-border)" }}>
              <Tooltip content="Launch interactive guided tour" position="bottom">
                <button
                  className="btn btn-sm"
                  onClick={() => setTourOpen(true)}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    color: "var(--color-accent-fg)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontWeight: 600,
                    fontSize: "12px",
                    height: "24px",
                    padding: "0 8px",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "14px", fontWeight: 700 }}>help</span>
                  Guide Tour
                </button>
              </Tooltip>
              <Tooltip content="Hide tour button permanently" position="bottom">
                <button
                  onClick={handleDismissTourButton}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-fg-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    fontSize: "10px",
                  }}
                >
                  ✕
                </button>
              </Tooltip>
            </div>
          )}

          <Tooltip content="Switch active developer profile" position="bottom">
            <button className="btn btn-sm" onClick={() => {
              router.push("/setup");
            }}>
              Switch Workspace
            </button>
          </Tooltip>
        </div>
      </header>

      {/* Main Core Layout */}
      <div className="main-layout">
        {/* Leftmost Sidebar tabs */}
        <nav className="sidebar" id="tour-sidebar">
          <Tooltip content="Workspace Editor & Server" position="right">
            <button
              onClick={() => setActiveTab("workspace")}
              className={`sidebar-btn ${activeTab === "workspace" ? "active" : ""}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </button>
          </Tooltip>
 
          <Tooltip content="Git Sync & Collaboration" position="right">
            <button
              onClick={() => setActiveTab("git")}
              className={`sidebar-btn ${activeTab === "git" ? "active" : ""}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            </button>
          </Tooltip>
 
          <Tooltip content="Environment Diagnostics" position="right">
            <button
              id="tour-diagnostics-btn"
              onClick={() => setActiveTab("diagnostics")}
              className={`sidebar-btn ${activeTab === "diagnostics" ? "active" : ""}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </button>
          </Tooltip>
 
          <Tooltip content="Contribution Heatmap & Logs" position="right">
            <button
              onClick={() => setActiveTab("timeline")}
              className={`sidebar-btn ${activeTab === "timeline" ? "active" : ""}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </Tooltip>

          <Tooltip content="Workspace Settings" position="right">
            <button
              onClick={() => setActiveTab("settings")}
              className={`sidebar-btn ${activeTab === "settings" ? "active" : ""}`}
              style={{ marginTop: "auto" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </Tooltip>
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
                  <Tooltip content={runnerStatus?.status === "running" || runnerStatus?.status === "starting" ? "Terminate active development server" : "Launch local development server"} position="bottom">
                    <button
                      id="tour-runner"
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
                  </Tooltip>

                  <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", display: "flex", alignItems: "center", gap: "8px" }}>
                    {runnerStatus?.status === "running" && <span style={{ color: "var(--color-success-fg)", fontWeight: 600 }}>Active (PID: {runnerStatus?.pid})</span>}
                    {runnerStatus?.status === "starting" && <span style={{ color: "var(--color-attention-fg)" }}>Starting...</span>}
                    {runnerStatus?.status === "stopped" && <span>Dev Server Stopped</span>}
                    {runnerStatus?.status === "error" && <span style={{ color: "var(--color-danger-fg)" }}>Error: {runnerStatus?.error}</span>}
                    {activeProfile?.runCommand && (
                      <span style={{ fontSize: "11px", color: "var(--color-fg-subtle)", fontFamily: "var(--font-mono)" }}>
                        {activeProfile.runCommand}
                      </span>
                    )}

                    {runnerStatus?.status === "running" && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "8px" }}>
                        {launchOptions.includes("browser") && (
                          <Tooltip content="Open web application in your default browser" position="bottom">
                            <button
                              type="button"
                              onClick={() => handleLaunchTarget("browser")}
                              className="btn btn-sm"
                              style={{
                                backgroundColor: "rgba(56, 139, 253, 0.15)",
                                borderColor: "rgba(56, 139, 253, 0.4)",
                                color: "var(--color-accent-fg)",
                                fontWeight: 650,
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                fontSize: "11px",
                                height: "26px"
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "11px" }}>open_in_new</span>
                              Launch Browser
                            </button>
                          </Tooltip>
                        )}
                        {launchOptions.includes("electron") && (
                          <Tooltip content="Open application window using Electron frame" position="bottom">
                            <button
                              type="button"
                              onClick={() => handleLaunchTarget("electron")}
                              className="btn btn-sm"
                              style={{
                                backgroundColor: "rgba(63, 185, 80, 0.15)",
                                borderColor: "rgba(63, 185, 80, 0.4)",
                                color: "var(--color-success-fg)",
                                fontWeight: 650,
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                fontSize: "11px",
                                height: "26px"
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "11px" }}>devices</span>
                              Launch Electron App
                            </button>
                          </Tooltip>
                        )}
                        {launchOptions.includes("xcode") && (
                          <Tooltip content="Open Xcode simulator framework" position="bottom">
                            <button
                              type="button"
                              onClick={() => handleLaunchTarget("xcode")}
                              className="btn btn-sm"
                              style={{
                                backgroundColor: "rgba(210, 153, 34, 0.15)",
                                borderColor: "rgba(210, 153, 34, 0.4)",
                                color: "var(--color-attention-fg)",
                                fontWeight: 650,
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                fontSize: "11px",
                                height: "26px"
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "11px" }}>terminal</span>
                              Open Xcode
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--color-fg-muted)" }}>Active Branch:</span>
                  <Tooltip content="Select active repository branch to sync" position="bottom">
                    <select
                      id="tour-branch"
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
                  </Tooltip>

                  {/* Open in IDE Dropdown Container */}
                  <div style={{ position: "relative" }}>
                    <Tooltip content="Open codebase in an IDE" position="bottom">
                      <button
                        className="btn btn-sm"
                        onClick={() => setIsIdeDropdownOpen(!isIdeDropdownOpen)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          height: "28px",
                          padding: "2px 10px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>code</span>
                        Open in
                      </button>
                    </Tooltip>

                    {isIdeDropdownOpen && (
                      <div style={{
                        position: "absolute",
                        right: 0,
                        top: "32px",
                        backgroundColor: "var(--color-bg-overlay)",
                        border: "1px solid var(--color-border-default)",
                        borderRadius: "8px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                        zIndex: 100,
                        width: "180px",
                        display: "flex",
                        flexDirection: "column",
                        padding: "6px",
                      }}>
                        {[
                          { id: "vscode", label: "VS Code", icon: "/icons/ide/vscode.svg" },
                          { id: "zed", label: "Zed Editor", icon: "/icons/ide/zed.svg" },
                          { id: "intellij", label: "IntelliJ IDEA", icon: "/icons/ide/intellij.svg" },
                          { id: "webstorm", label: "WebStorm", icon: "/icons/ide/webstorm.svg" },
                          { id: "xcode", label: "Xcode", icon: "/icons/ide/xcode.svg" },
                          { id: "antigravity", label: "Antigravity", icon: "/icons/ide/antigravity.svg" },
                          { id: "codex", label: "Codex", icon: "/icons/ide/codex.svg" },
                        ].map((ide) => (
                          <button
                            key={ide.id}
                            type="button"
                            onClick={() => handleLaunchIde(ide.id, ide.label)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 10px",
                              backgroundColor: "transparent",
                              border: "none",
                              color: "var(--color-fg-default)",
                              fontSize: "12px",
                              textAlign: "left",
                              cursor: "pointer",
                              borderRadius: "4px",
                              width: "100%",
                            }}
                            className="hover-bg-active"
                          >
                            <img
                              src={ide.icon}
                              alt=""
                              width={14}
                              height={14}
                              style={{ flexShrink: 0, objectFit: "contain" }}
                            />
                            <span style={{ flex: 1 }}>{ide.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                  height: "100%",
                  minHeight: 0,
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
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
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
                  height: "100%",
                  minHeight: 0,
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

                    <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                      {(["fetch", "pull", "push"] as const).map((action) => (
                        <button
                          key={action}
                          type="button"
                          className="btn btn-sm"
                          disabled={!!isGitSyncing || (action === "push" && branchProtected)}
                          onClick={() => handleGitSync(action)}
                          style={{
                            flex: 1,
                            textTransform: "capitalize",
                            fontSize: "11px",
                            fontWeight: 600,
                            opacity: action === "push" && branchProtected ? 0.5 : 1,
                          }}
                          title={
                            action === "push" && branchProtected
                              ? "Push to main/master is disabled by branch protection"
                              : undefined
                          }
                        >
                          {isGitSyncing === action ? "..." : action}
                        </button>
                      ))}
                    </div>

                    {gitSyncError && (
                      <div style={{
                        fontSize: "11px",
                        color: "var(--color-danger-fg)",
                        backgroundColor: "var(--color-danger-bg)",
                        border: "1px solid var(--color-danger-border)",
                        borderRadius: "4px",
                        padding: "6px 8px",
                        lineHeight: "1.4",
                      }}>
                        {gitSyncError}
                      </div>
                    )}
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
                              <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--color-danger-fg)", fontWeight: 700 }}>error</span>
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
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-fg"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M22 12H2"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
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
                          {isLiveTerminalActive ? (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "6px", marginBottom: "10px", fontSize: "11px" }}>
                                <span style={{ color: "var(--color-fg-muted)" }}>live_terminal_stream.log</span>
                                <span className="badge badge-warning animate-pulse" style={{ color: "var(--color-attention-fg)", borderColor: "var(--color-attention-border)" }}>Running...</span>
                              </div>
                              <pre style={{
                                margin: 0,
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                color: "#3fb950",
                                whiteSpace: "pre-wrap",
                              }}>
                                {diagnosticLogs.map((log, idx) => (
                                  <div key={idx}>{log}</div>
                                ))}
                              </pre>
                              <div ref={liveTerminalEndRef} />
                            </div>
                          ) : (runnerStatus?.status === "running" || runnerStatus?.status === "starting") ? (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "6px", marginBottom: "10px", fontSize: "11px" }}>
                                <span style={{ color: "var(--color-fg-muted)" }}>dev_server_stream.log</span>
                                <span className="badge badge-success animate-pulse" style={{ color: "var(--color-success-fg)", borderColor: "var(--color-success-border)" }}>
                                  {runnerStatus.status === "starting" ? "Starting..." : "Running"}
                                </span>
                              </div>
                              <pre style={{
                                margin: 0,
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                color: "#e6edf3",
                                whiteSpace: "pre-wrap",
                              }}>
                                <div className="mb-xs" style={{ color: "#3fb950" }}>{diagData ? `${diagData.username || "shockagg"}@${diagData.hostname || "Nipuns-MacBook-Air"} ${diagData.folderName || "OmniSync"} % npm run dev` : "shockagg@Nipuns-MacBook-Air OmniSync % npm run dev"}</div>
                                {runnerLogs.map((log, idx) => (
                                  <div key={idx} style={{ color: log.includes("[ERROR]") ? "var(--color-danger-fg)" : "#8b949e" }}>{log}</div>
                                ))}
                              </pre>
                            </div>
                          ) : actionOutput ? (
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
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#8b949e", textAlign: "left" }}>
                              <div>{diagData ? `${diagData.username || "shockagg"}@${diagData.hostname || "Nipuns-MacBook-Air"} ${diagData.folderName || "OmniSync"} %` : "shockagg@Nipuns-MacBook-Air OmniSync %"}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Project Specifications Card */}
                  <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", background: "rgba(22, 27, 34, 0.2)", border: "1px solid var(--color-border-default)" }}>
                    <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Project Specifications</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div>
                        <div style={{ fontSize: "11px", color: "var(--color-fg-subtle)" }}>Project Name</div>
                        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-fg-default)", marginTop: "2px" }}>{diagData.projectName || "Unnamed Project"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "11px", color: "var(--color-fg-subtle)" }}>Version & License</div>
                        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-fg-default)", marginTop: "2px" }}>v{diagData.projectVersion || "1.0.0"} ({diagData.projectLicense || "MIT"})</div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--color-fg-subtle)" }}>Description</div>
                      <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", marginTop: "2px", lineHeight: "1.4" }}>{diagData.projectDescription || "No description available in package.json."}</div>
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
                <>
                  {/* Yearly Contribution Calendar */}
                  <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", flexShrink: 0 }}>
                    <style dangerouslySetInnerHTML={{__html: `
                      .contribution-square:hover {
                        transform: scale(1.2);
                        filter: brightness(1.2);
                      }
                    `}} />
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-fg-default)" }}>
                          Yearly Commit Activity
                        </div>
                        
                        {/* Year switcher buttons */}
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", backgroundColor: "var(--color-bg-active)", padding: "2px", borderRadius: "6px", border: "1px solid var(--color-border-default)" }}>
                          <button
                            className="btn btn-sm"
                            disabled={calendarYear <= repoStartYear}
                            onClick={() => {
                              if (calendarYear > repoStartYear) {
                                setCalendarYear((y) => y - 1);
                              }
                            }}
                            style={{
                              padding: "2px 6px",
                              fontSize: "10px",
                              height: "20px",
                              display: "flex",
                              alignItems: "center",
                              opacity: calendarYear <= repoStartYear ? 0.4 : 1,
                              cursor: calendarYear <= repoStartYear ? "not-allowed" : "pointer"
                            }}
                          >
                           <Tooltip content={calendarYear <= repoStartYear ? "Limit reached (no older commits)" : "Go to previous year commit calendar"} position="top">
                             &lt;
                           </Tooltip>
                          </button>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-fg-default)", minWidth: "36px", textAlign: "center" }}>
                            {calendarYear}
                          </span>
                          <button
                            className="btn btn-sm"
                            disabled={calendarYear >= currentYear}
                            onClick={() => {
                              if (calendarYear < currentYear) {
                                setCalendarYear((y) => y + 1);
                              }
                            }}
                            style={{
                              padding: "2px 6px",
                              fontSize: "10px",
                              height: "20px",
                              display: "flex",
                              alignItems: "center",
                              opacity: calendarYear >= currentYear ? 0.4 : 1,
                              cursor: calendarYear >= currentYear ? "not-allowed" : "pointer"
                            }}
                          >
                           <Tooltip content={calendarYear >= currentYear ? "Limit reached (current year)" : "Go to next year commit calendar"} position="top">
                             &gt;
                           </Tooltip>
                          </button>
                        </div>

                        <span style={{ fontSize: "12px", color: "var(--color-fg-muted)" }}>
                          ({totalCommitsLastYear} commits)
                        </span>
                      </div>
                      <button
                        className="btn btn-sm"
                        onClick={() => setIsYearlyCalendarExpanded(!isYearlyCalendarExpanded)}
                        style={{ fontSize: "11px", padding: "4px 10px" }}
                      >
                        {isYearlyCalendarExpanded ? "Hide Calendar ▴" : "Show Calendar ▾"}
                      </button>
                    </div>

                    {isYearlyCalendarExpanded && (
                      <>
                        <div style={{ overflowX: "auto", paddingBottom: "4px", width: "100%" }}>
                          <div style={{
                            minWidth: "max-content",
                            display: "grid",
                            gridTemplateColumns: `24px repeat(${Math.ceil(contributionDays.length / 7)}, 10px)`,
                            gridTemplateRows: "15px repeat(7, 10px)",
                            gap: "2px",
                            fontSize: "9px",
                            color: "var(--color-fg-muted)"
                          }}>
                            {/* Month labels */}
                            {monthLabels.map((lbl, idx) => (
                              <span
                                key={`month-${idx}`}
                                style={{
                                  gridColumnStart: lbl.colIdx + 2,
                                  gridColumnEnd: "span 4",
                                  gridRowStart: 1,
                                  whiteSpace: "nowrap",
                                  alignSelf: "end",
                                  paddingBottom: "2px"
                                }}
                              >
                                {lbl.text}
                              </span>
                            ))}

                            {/* Day labels */}
                            <div style={{ gridColumnStart: 1, gridRowStart: 3, textAlign: "right", lineHeight: "10px", paddingRight: "6px" }}>Mon</div>
                            <div style={{ gridColumnStart: 1, gridRowStart: 5, textAlign: "right", lineHeight: "10px", paddingRight: "6px" }}>Wed</div>
                            <div style={{ gridColumnStart: 1, gridRowStart: 7, textAlign: "right", lineHeight: "10px", paddingRight: "6px" }}>Fri</div>

                            {/* Dots */}
                            {contributionDays.map((date, idx) => {
                              const colIdx = Math.floor(idx / 7);
                              const dayOfWeek = date.getDay();
                              const dateString = formatLocalDate(date);
                              const isSameYear = date.getFullYear() === calendarYear;
                              const count = isSameYear ? (commitCountsByDate[dateString] || 0) : 0;
                              const isSelected = selectedCalendarDate === dateString;
                              const color = getContributionColor(count);
                              
                              if (!isSameYear) {
                                return (
                                  <div
                                    key={`dot-${idx}`}
                                    style={{
                                      gridColumnStart: colIdx + 2,
                                      gridRowStart: dayOfWeek + 2,
                                      width: "10px",
                                      height: "10px",
                                      backgroundColor: "transparent",
                                      pointerEvents: "none"
                                    }}
                                  />
                                );
                              }

                              return (
                                <Tooltip
                                  key={`dot-${idx}`}
                                  content={`${count} commit${count === 1 ? "" : "s"} on ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`}
                                  position="top"
                                >
                                  <div
                                    onClick={() => handleSquareClick(dateString, date)}
                                    style={{
                                      gridColumnStart: colIdx + 2,
                                      gridRowStart: dayOfWeek + 2,
                                      width: "10px",
                                      height: "10px",
                                      borderRadius: "2px",
                                      backgroundColor: color,
                                      cursor: "pointer",
                                      transition: "transform 0.1s ease, box-shadow 0.1s ease",
                                      boxShadow: isSelected ? "0 0 0 1.5px var(--color-accent-fg)" : "none",
                                      zIndex: isSelected ? 2 : 1,
                                    }}
                                    className="contribution-square"
                                  />
                                </Tooltip>
                              );
                            })}
                          </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", borderTop: "1px solid var(--color-border-default)", paddingTop: "12px" }}>
                          <div style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>
                            Click any cell to load the timeline details for that date.
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--color-fg-muted)" }}>
                            <span>Less</span>
                            <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(0) }} />
                            <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(1) }} />
                            <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(3) }} />
                            <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(6) }} />
                            <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(10) }} />
                            <span>More</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: "24px", alignItems: "start", flexShrink: 0 }}>
                  
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
                        <Tooltip content="Jump to the very first commit of the repository" position="top">
                          <button
                            className="btn btn-sm"
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
                          >
                            Repo Start ⇤
                          </button>
                        </Tooltip>

                        <Tooltip content="Jump to the current month & year calendar view" position="top">
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
                        </Tooltip>
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
                                  {hasMerges && <span style={{ fontSize: "9px", color: "var(--color-danger-fg)", fontWeight: "bold" }}>M</span>}
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
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>                    {/* Quick Month Metrics Widget */}
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
                  </div>
                </div>
                </>
              )}
            </div>
          )}

          {/* TAB 4: WORKSPACE SETTINGS PANEL */}
          {activeTab === "settings" && (
            <WorkspaceSettingsView
              activeProfile={activeProfile}
              onProfileUpdated={(updatedProfile) => {
                const commandChanged =
                  updatedProfile.runCommand !== activeProfile?.runCommand ||
                  updatedProfile.port !== activeProfile?.port;
                setActiveProfile(updatedProfile);
                loadWorkspaceFiles();
                loadGitBranches();
                loadGitSyncStatus();
                if (
                  commandChanged &&
                  (runnerStatus?.status === "running" || runnerStatus?.status === "starting")
                ) {
                  showNotification(
                    "Run command or port changed — stop and restart the dev server to apply.",
                    "info",
                    6000
                  );
                }
              }}
            />
          )}
        </main>
      </div>

      <ProductTour
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpenExternally={tourOpen}
        onCloseExternally={() => setTourOpen(false)}
      />
    </div>
  );
}
