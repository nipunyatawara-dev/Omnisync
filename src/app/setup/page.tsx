"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter as useAppRouter } from "next/navigation";
import { applyAccentTheme } from "@/lib/accentTheme";
import type { AccentColor } from "@/lib/globalSettings";
import { UserProfile } from "@/lib/profiles";

declare global {
  interface Window {
    electron?: {
      selectDirectory: () => Promise<string | null>;
    };
  }
}

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
  // gitToken is held only in memory for the duration of an active setup session
  // (never persisted to localStorage). Once a profile is saved, the server holds
  // the token and drives all GitHub requests.
  const [gitToken, setGitToken] = useState("");
  const [githubConnected, setGithubConnected] = useState(false);

  // Settings & App Documentation Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"global-settings" | "git-config" | "app-docs" | "tour-cache">("global-settings");

  // Global Settings States
  const [globalGitUsername, setGlobalGitUsername] = useState("");
  const [globalGitEmail, setGlobalGitEmail] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [autoFetchInterval, setAutoFetchInterval] = useState("5");
  const [terminalShell, setTerminalShell] = useState("zsh");
  const [showHiddenFiles, setShowHiddenFiles] = useState(false);
  const [enableTelemetry, setEnableTelemetry] = useState(true);
  const [accentColor, setAccentColor] = useState("default");

  // Load from server (fallback to localStorage for legacy installs)
  useEffect(() => {
    if (typeof window === "undefined") return;

    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          const s = data.settings;
          if (s) {
            setGlobalGitUsername(s.gitUsername || "");
            setGlobalGitEmail(s.gitEmail || "");
            setDefaultBranch(s.defaultBranch || "main");
            setAutoFetchInterval(s.autoFetchInterval || "5");
            setTerminalShell(s.terminalShell || "zsh");
            setShowHiddenFiles(!!s.showHiddenFiles);
            setEnableTelemetry(s.enableTelemetry !== false);
            setAccentColor(s.accentColor || "default");
            applyAccentTheme((s.accentColor || "default") as AccentColor);
            return;
          }
        }
      } catch {}

      setGlobalGitUsername(localStorage.getItem("omnisync_global_git_username") || "");
      setGlobalGitEmail(localStorage.getItem("omnisync_global_git_email") || "");
      setDefaultBranch(localStorage.getItem("omnisync_global_default_branch") || "main");
      setAutoFetchInterval(localStorage.getItem("omnisync_global_auto_fetch_interval") || "5");
      setTerminalShell(localStorage.getItem("omnisync_global_terminal_shell") || "zsh");
      setShowHiddenFiles(localStorage.getItem("omnisync_global_show_hidden") === "true");
      setEnableTelemetry(localStorage.getItem("omnisync_global_telemetry") !== "false");
      const cachedAccent = (localStorage.getItem("omnisync_global_accent") || "default") as AccentColor;
      setAccentColor(cachedAccent);
      applyAccentTheme(cachedAccent);
    }

    loadSettings();
  }, []);

  // Save settings handler
  const handleSaveGlobalSettings = async () => {
    if (typeof window === "undefined") return;

    const payload = {
      gitUsername: globalGitUsername,
      gitEmail: globalGitEmail,
      defaultBranch,
      autoFetchInterval,
      terminalShell,
      showHiddenFiles,
      enableTelemetry,
      accentColor,
    };

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to save settings.");
        return;
      }
    } catch {
      alert("Failed to save settings.");
      return;
    }

    localStorage.setItem("omnisync_global_git_username", globalGitUsername);
    localStorage.setItem("omnisync_global_git_email", globalGitEmail);
    localStorage.setItem("omnisync_global_default_branch", defaultBranch);
    localStorage.setItem("omnisync_global_auto_fetch_interval", autoFetchInterval);
    localStorage.setItem("omnisync_global_terminal_shell", terminalShell);
    localStorage.setItem("omnisync_global_show_hidden", String(showHiddenFiles));
    localStorage.setItem("omnisync_global_telemetry", String(enableTelemetry));
    localStorage.setItem("omnisync_global_accent", accentColor);
    applyAccentTheme(accentColor as AccentColor);
    alert("Global settings saved successfully!");
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", id: null }),
      });
    } catch {}
    setGitToken("");
    setGitUsername("");
    setGithubConnected(false);
    setGithubUserDetail(null);
    setStep("login");
  };

  // Real OAuth & Simulated UI support State
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState(false);
  const [oauthState, setOauthState] = useState<"idle" | "authorizing" | "success">("idle");
  const [oauthStatusText, setOauthStatusText] = useState("");
  
  // Real OAuth App Config State
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [githubClientId, setGithubClientId] = useState("");
  const [showOauthConfigForm, setShowOauthConfigForm] = useState(false);
  
  // Custom credentials form input state
  const [inputClientId, setInputClientId] = useState("");
  const [isSavingOauthConfig, setIsSavingOauthConfig] = useState(false);
  const [oauthConfigError, setOauthConfigError] = useState("");

  // Device Flow code state
  const [userCode, setUserCode] = useState("");
  const [verificationUri, setVerificationUri] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Track if modal is open to clean up polling
  const modalOpenRef = useRef(false);
  useEffect(() => {
    modalOpenRef.current = isOAuthModalOpen;
  }, [isOAuthModalOpen]);

  // Fetch current OAuth config status
  const checkOauthConfig = async () => {
    try {
      const res = await fetch("/api/auth/config");
      const data = await res.json();
      if (data.hasConfig) {
        setOauthConfigured(true);
        setGithubClientId(data.clientId || "");
      } else {
        setOauthConfigured(false);
      }
    } catch {
      setOauthConfigured(false);
    }
  };

  // Save custom Client ID
  const handleSaveOauthConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputClientId) {
      setOauthConfigError("Client ID is required.");
      return;
    }

    setIsSavingOauthConfig(true);
    setOauthConfigError("");

    try {
      const res = await fetch("/api/auth/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: inputClientId, clientSecret: "device_flow_public" }),
      });
      const data = await res.json();
      if (data.success) {
        setOauthConfigured(true);
        setGithubClientId(inputClientId);
        setShowOauthConfigForm(false);
        // Automatically launch OAuth after saving config
        triggerGitHubDeviceFlow();
      } else {
        setOauthConfigError(data.error || "Failed to save configuration.");
      }
    } catch (err: unknown) {
      setOauthConfigError(err instanceof Error ? err.message : "Error saving Client ID.");
    } finally {
      setIsSavingOauthConfig(false);
    }
  };

  // Triggers the real GitHub Device Flow login
  const triggerGitHubDeviceFlow = async () => {
    setIsOAuthModalOpen(true);
    setOauthState("authorizing");
    setOauthStatusText("Requesting authorization codes from GitHub...");
    setUserCode("");
    setVerificationUri("");

    try {
      const res = await fetch("/api/auth/device/code", { method: "POST" });
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setUserCode(data.userCode);
      setVerificationUri(data.verificationUri);
      setOauthStatusText("Waiting for authorization on GitHub...");

      // Start polling for token
      startDevicePoll(data.deviceCode, data.interval || 5);
    } catch (err: unknown) {
      setOauthState("idle");
      setIsOAuthModalOpen(false);
      alert(`Failed to start GitHub Device Flow: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Polls GitHub backend for device code approval
  const startDevicePoll = (devCode: string, intervalSeconds: number) => {
    let active = true;
    
    const checkStatus = async () => {
      if (!active || !modalOpenRef.current) {
        active = false;
        return;
      }
      try {
        const res = await fetch("/api/auth/device/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode: devCode }),
        });
        const data = await res.json();

        if (data.status === "success") {
          active = false;
          setOauthStatusText("Successfully authenticated!");
          setOauthState("success");
          
          setGitUsername(data.username);
          setGitToken(data.token);
          setGithubConnected(true);
          setGithubUserDetail({
            avatarUrl: data.avatarUrl || "",
            htmlUrl: "",
            name: data.username,
            bio: "Active developer profile",
            publicRepos: 0,
            login: data.username,
          });
          setManualPath(process.cwd());
          
          await new Promise((resolve) => setTimeout(resolve, 1000));
          setIsOAuthModalOpen(false);
          setOauthState("idle");
          setStep("profile-selection");
        } else if (data.status === "error") {
          active = false;
          setOauthState("idle");
          setIsOAuthModalOpen(false);
          alert(`Authentication error: ${data.error}`);
        } else {
          // data.status === "pending" -> poll again
          setTimeout(checkStatus, intervalSeconds * 1000);
        }
      } catch (err) {
        console.error("Polling error", err);
        setTimeout(checkStatus, intervalSeconds * 1000);
      }
    };

    // Trigger first check after interval
    setTimeout(checkStatus, intervalSeconds * 1000);
  };

  // Handle GitHub Sign In Button
  const handleGitHubSignIn = () => {
    if (oauthConfigured && githubClientId) {
      triggerGitHubDeviceFlow();
    } else {
      setShowOauthConfigForm(true);
    }
  };

  // Profiles State
  const [profilesList, setProfilesList] = useState<UserProfile[]>([]);

  // Repo setup state
  const [repoName, setRepoName] = useState("");

  // Manual setup state
  const [manualPath, setManualPath] = useState("");
  const [manualStatus, setManualStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [manualScanResult, setManualScanResult] = useState<DiagnosticScanResult | null>(null);
  const [manualError, setManualError] = useState("");

  // Cloning setup state
  interface UIRepository {
    id: number;
    name: string;
    fullName: string;
    description: string | null;
    cloneUrl: string;
    private: boolean;
    owner: string;
  }

  const [setupMode, setSetupMode] = useState<"clone" | "local">("clone");
  const [reposList, setReposList] = useState<UIRepository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [clonePath, setClonePath] = useState("");
  const [cloneStatus, setCloneStatus] = useState<"idle" | "cloning" | "success" | "error">("idle");
  const [cloneError, setCloneError] = useState("");
  const [cloneLogs, setCloneLogs] = useState<string[]>([]);
  const [githubUserDetail, setGithubUserDetail] = useState<{
    avatarUrl: string;
    htmlUrl: string;
    name: string;
    bio: string;
    publicRepos: number;
    login: string;
  } | null>(null);
  const [isPatValidating, setIsPatValidating] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll terminal to bottom as logs append
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [cloneLogs]);

  // Fetch remote repositories asynchronously when entering Step 3
  useEffect(() => {
    let active = true;
    if (step === "repo-selection") {
      Promise.resolve().then(() => {
        if (!active) return;
        if (githubConnected) {
          setSetupMode("clone");
          setIsFetchingRepos(true);
          // Send the in-memory token only during initial setup; returning
          // sessions rely on the server-stored token.
          const options = gitToken ? { headers: { Authorization: `Bearer ${gitToken}` } } : undefined;
          fetch("/api/github/repos", options)
            .then((res) => res.json())
            .then((data) => {
              if (!active) return;
              if (data.repos) {
                setReposList(data.repos as UIRepository[]);
                if (data.repos.length > 0) {
                  setSelectedRepoId(data.repos[0].id.toString());
                  setClonePath(`/Users/username/Documents/GitHub/${data.repos[0].name}`);
                }
              } else {
                setReposList([]);
              }
              setIsFetchingRepos(false);
            })
            .catch((err) => {
              console.error(err);
              if (active) {
                setReposList([]);
                setIsFetchingRepos(false);
              }
            });
        } else {
          setSetupMode("local");
        }
      });
    }
    return () => {
      active = false;
    };
  }, [step, githubConnected, gitToken]);

  // Handle repository selection change to update default clone path
  const handleRepoChange = (repoId: string) => {
    setSelectedRepoId(repoId);
    setCloneError("");
    setCloneStatus("idle");
    const repo = reposList.find((r) => r.id.toString() === repoId);
    if (repo) {
      const defaultParent = clonePath ? clonePath.substring(0, clonePath.lastIndexOf("/")) : "/Users/username/Documents/GitHub";
      setClonePath(`${defaultParent}/${repo.name}`);
    }
  };

  // Open native directory select dialog in Electron
  const handleChooseClonePath = async () => {
    if (typeof window !== "undefined" && window.electron) {
      const selected = await window.electron.selectDirectory();
      if (selected) {
        setClonePath(selected);
        setCloneError("");
        setCloneStatus("idle");
      }
    }
  };

  const handleChooseManualPath = async () => {
    if (typeof window !== "undefined" && window.electron) {
      const selected = await window.electron.selectDirectory();
      if (selected) {
        setManualPath(selected);
        setManualError("");
        setManualStatus("idle");
      }
    }
  };

  // Perform git clone and initialize profile workspace
  const runCloneAndSetup = async () => {
    if (!selectedRepoId) {
      setCloneError("Please select a repository to clone");
      return;
    }
    const repo = reposList.find((r) => r.id.toString() === selectedRepoId);
    if (!repo) return;

    if (!clonePath) {
      setCloneError("Please specify a directory path to clone into");
      return;
    }

    setCloneStatus("cloning");
    setCloneError("");
    setCloneLogs([]);

    try {
      // 1. Start streaming clone process
      const cloneRes = await fetch("/api/github/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloneUrl: repo.cloneUrl,
          localPath: clonePath,
          token: gitToken || undefined,
        }),
      });

      if (!cloneRes.ok) {
        const errText = await cloneRes.text();
        let errMsg = "Failed to clone repository";
        try {
          const errData = JSON.parse(errText);
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = errText || errMsg;
        }
        throw new Error(errMsg);
      }

      if (!cloneRes.body) {
        throw new Error("No output stream received from server.");
      }

      const reader = cloneRes.body.getReader();
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
            const data = JSON.parse(line);
            if (data.type === "log") {
              setCloneLogs((prev) => [...prev, data.message]);
            } else if (data.type === "error") {
              throw new Error(data.message);
            }
          } catch {
            // Ignore partial JSON lines
          }
        }
      }

      setCloneLogs((prev) => [...prev, "> Starting workspace database configuration..."]);

      // 2. Create workspace profile
      const workspaceRecordName = repoName || repo.name;
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

      // 3. Update workspace path and type
      await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: newProfile.id,
          updates: {
            workspacePath: clonePath,
            workspaceType: "automatic",
          },
        }),
      });

      // 4. Scan diagnostics
      const diagRes = await fetch("/api/workspace/diagnostics");
      const diagData = await diagRes.json();

      if (diagData.error) {
        throw new Error(diagData.error);
      }

      setManualScanResult(diagData as DiagnosticScanResult);
      setManualStatus("success"); // reuse status view for launch
      setCloneStatus("success");
    } catch (err: unknown) {
      setCloneStatus("error");
      setCloneError(err instanceof Error ? err.message : "Failed to clone and setup workspace.");
    }
  };

  // Fetch logged in GitHub user details via the server, which uses the
  // stored token. Avoids handling the raw token in the browser.
  const fetchGithubUserDetail = async () => {
    try {
      const res = await fetch("/api/github/user");
      if (res.ok) {
        const data = await res.json();
        setGithubUserDetail({
          avatarUrl: data.avatarUrl,
          htmlUrl: data.htmlUrl,
          name: data.name || data.login,
          bio: data.bio || "Active developer profile",
          publicRepos: data.publicRepos,
          login: data.login,
        });
      }
    } catch (e) {
      console.error("Failed to fetch GitHub user details", e);
    }
  };

  // Fetch all profiles
  const loadProfiles = async () => {
    try {
      const res = await fetch("/api/profiles");
      const data = await res.json();
      const profiles = data.profiles || [];
      setProfilesList(profiles);

      // Restore GitHub connection state from existing profiles. The token stays
      // server-side; the client only learns that a token exists.
      const profileWithToken = profiles.find((p: UserProfile) => p.hasGitToken);
      if (profileWithToken) {
        setGithubConnected(true);
        setGitUsername(profileWithToken.name);
        fetchGithubUserDetail();
      }

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
      checkOauthConfig();
    });

    // Check url query parameters for redirect OAuth fallback
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_success") === "true") {
      let token = "";
      let username = "";
      let avatarUrl = "";
      try {
        token = sessionStorage.getItem("oauth_token") || "";
        username = sessionStorage.getItem("oauth_username") || "";
        avatarUrl = sessionStorage.getItem("oauth_avatar") || "";
        sessionStorage.removeItem("oauth_token");
        sessionStorage.removeItem("oauth_username");
        sessionStorage.removeItem("oauth_avatar");
      } catch (e) {
        console.error("sessionStorage read error:", e);
      }
      if (token && username) {
        Promise.resolve().then(() => {
          setGitUsername(username);
          setGitToken(token);
          setGithubConnected(true);
          setGithubUserDetail({
            avatarUrl,
            htmlUrl: "",
            name: username,
            bio: "Active developer profile",
            publicRepos: 0,
            login: username,
          });
          setManualPath(process.cwd());
          setStep("profile-selection");
        });
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else if (params.get("oauth_error")) {
      alert(`GitHub Authentication Failed: ${params.get("oauth_error")}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Handle GitHub Login (Manual PAT route)
  const handleGitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = gitUsername.trim();
    const token = gitToken.trim();

    if (!username) {
      alert("Please enter a GitHub username");
      return;
    }

    if (token) {
      setIsPatValidating(true);
      try {
        const res = await fetch("/api/github/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok || !data.valid) {
          alert(data.error || "Invalid GitHub token. Check the token and try again.");
          return;
        }
        setGitUsername(data.login || username);
        setGithubConnected(true);
        setGithubUserDetail({
          avatarUrl: data.avatarUrl || "",
          htmlUrl: "",
          name: data.name || data.login || username,
          bio: "Active developer profile",
          publicRepos: 0,
          login: data.login || username,
        });
      } catch {
        alert("Failed to validate GitHub token. Check your connection and try again.");
        return;
      } finally {
        setIsPatValidating(false);
      }
    } else {
      setGithubConnected(false);
      setGithubUserDetail(null);
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
    <div className="flex flex-col md:flex-row w-full h-screen overflow-hidden bg-surface text-on-surface">
      {/* Left Column: Product Branding (Only visible on login step) */}
      {step === "login" && (
        <div className="w-full md:w-[400px] p-xl bg-surface-container flex flex-col border-b md:border-b-0 md:border-r border-outline-variant shrink-0 animate-fade-in">
          <div className="flex items-center gap-sm mb-lg">
            <img src="/icon.png" alt="Logo" style={{ height: "24px", width: "24px", objectFit: "contain", borderRadius: "4px" }} />
            <span className="font-headline-sm text-headline-sm tracking-tight text-on-surface">OmniSync</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-md">The Local Deck for GitHub</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mb-xl">
            Integrate code editing, terminal execution, live background logs, and visual merge resolution in a single local workspace control center.
          </p>
          <div className="flex flex-col gap-lg flex-grow overflow-y-auto pr-sm custom-scrollbar">
            <div className="flex items-start gap-md">
              <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center feature-icon-bg border border-outline-variant">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary-container">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </div>
              <div>
                <h3 className="font-button-text text-button-text text-on-surface mb-xs">Integrated Code Viewer</h3>
                <p className="font-body-md text-on-surface-variant text-[13px] leading-relaxed">Inspect repository folders, switch branches, and track commits.</p>
              </div>
            </div>
            <div className="flex items-start gap-md">
              <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center feature-icon-bg border border-outline-variant">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary-container">
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 15V9a4 4 0 0 0-4-4H9" />
                  <line x1="6" y1="9" x2="6" y2="15" />
                </svg>
              </div>
              <div>
                <h3 className="font-button-text text-button-text text-on-surface mb-xs">Three-Pane Conflict Resolver</h3>
                <p className="font-body-md text-on-surface-variant text-[13px] leading-relaxed">Resolve merges interactively without complex terminal inputs.</p>
              </div>
            </div>
            <div className="flex items-start gap-md">
              <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center feature-icon-bg border border-outline-variant">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary-container">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <h3 className="font-button-text text-button-text text-on-surface mb-xs">Deterministic Scanner</h3>
                <p className="font-body-md text-on-surface-variant text-[13px] leading-relaxed">Verify package integrity and execute safe cache repairs.</p>
              </div>
            </div>
          </div>
          <div className="mt-xl pt-md border-t border-outline-variant shrink-0">
            <p className="font-label-mono text-label-mono text-on-surface-variant">Verifying active environment configuration on startup.</p>
          </div>
        </div>
      )}

      {/* Right Column: Dynamic Content Panel */}
      <div className="w-full flex-1 bg-background flex flex-col overflow-hidden">
        {/* Top Header Bar for profile-selection & repo-selection steps */}
        {(step === "profile-selection" || step === "repo-selection") && (
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid var(--color-border-default)",
            backgroundColor: "var(--color-bg-subtle)",
            width: "100%",
            zIndex: 10,
            flexShrink: 0,
          }}>
            {/* Left brand or breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src="/icon.png" alt="Logo" style={{ height: "20px", width: "20px", objectFit: "contain", borderRadius: "4px" }} />
              <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-fg-default)" }}>OmniSync Workspace Launcher</span>
            </div>

            {/* Top Right Profile Info, Settings, and Logout */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {githubUserDetail && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginRight: "8px" }}>
                  {githubUserDetail.avatarUrl ? (
                    <img
                      src={githubUserDetail.avatarUrl}
                      alt={githubUserDetail.name}
                      style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid var(--color-border-default)" }}
                    />
                  ) : (
                    <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "var(--color-bg-active)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-on-surface-variant"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    </div>
                  )}
                  <div style={{ textAlign: "left", lineHeight: "1.2" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-fg-default)" }}>{githubUserDetail.name}</div>
                    <div style={{ fontSize: "10px", color: "var(--color-fg-muted)" }}>@{githubUserDetail.login}</div>
                  </div>
                </div>
              )}
              
              <button
                className="btn btn-sm"
                onClick={() => setIsSettingsOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>settings</span>
                Main Settings
              </button>

              <button
                className="btn btn-sm btn-danger"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <div className={`w-full ${step === "profile-selection" || step === "repo-selection" ? "max-w-[640px]" : "max-w-[500px]"} animate-fade-slide`}>
          
          {/* STEP 1: GITHUB LOGIN */}
          {step === "login" && (
            <div>
              {!showOauthConfigForm ? (
                <div>
                  <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">Connect Account</h2>
                  <p className="font-body-lg text-body-lg text-on-surface-variant mb-xl">
                    Authorize OmniSync to sync remote branches and workspace settings.
                  </p>
                  <button
                    type="button"
                    onClick={handleGitHubSignIn}
                    className="w-full btn-secondary rounded-lg py-md px-md flex items-center justify-center gap-sm font-button-text text-button-text mb-sm transition-colors cursor-pointer"
                  >
                    <svg aria-hidden="true" className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path clipRule="evenodd" d="M12 2C6.477 2 2 6.463 2 11.97c0 4.404 2.865 8.14 6.839 9.458.5.092.682-.216.682-.48 0-.236-.008-.864-.013-1.695-2.782.602-3.369-1.337-3.369-1.337-.454-1.151-1.11-1.458-1.11-1.458-.908-.618.069-.606.069-.606 1.003.07 1.531 1.027 1.531 1.027.892 1.524 2.341 1.084 2.91.828.092-.643.35-1.083.636-1.332-2.22-.251-4.555-1.107-4.555-4.927 0-1.088.39-1.979 1.029-2.675-.103-.252-.446-1.266.098-2.638 0 0 .84-.268 2.75 1.022A9.606 9.606 0 0112 6.82c.85.004 1.705.114 2.504.336 1.909-1.29 2.747-1.022 2.747-1.022.546 1.372.202 2.386.1 2.638.64.696 1.028 1.587 1.028 2.675 0 3.83-2.339 4.673-4.566 4.92.359.307.678.915.678 1.846 0 1.332-.012 2.407-.012 2.734 0 .267.18.577.688.48C19.137 20.107 22 16.373 22 11.969 22 6.463 17.522 2 12 2z" fillRule="evenodd"></path>
                    </svg>
                    Sign in with GitHub
                  </button>

                  <div className="flex justify-center mb-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setInputClientId(githubClientId);
                        setShowOauthConfigForm(true);
                      }}
                      className="text-xs text-on-surface-variant hover:text-secondary-container underline bg-transparent border-0 cursor-pointer"
                    >
                      {oauthConfigured ? "Reconfigure GitHub OAuth App" : "Configure Custom GitHub OAuth App"}
                    </button>
                  </div>
                  
                  <div className="relative flex items-center py-sm mb-xl">
                    <div className="flex-grow border-t border-outline-variant"></div>
                    <span className="flex-shrink-0 mx-4 font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider text-[10px]">
                      Or use personal access token
                    </span>
                    <div className="flex-grow border-t border-outline-variant"></div>
                  </div>

                  <form onSubmit={handleGitLogin}>
                    <div className="flex flex-col gap-lg mb-xl">
                      <div>
                        <label className="block font-button-text text-button-text text-on-surface mb-sm" htmlFor="username">
                          GitHub Username
                        </label>
                        <input
                          id="username"
                          type="text"
                          className="w-full input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow"
                          value={gitUsername}
                          onChange={(e) => setGitUsername(e.target.value)}
                          placeholder="octocat"
                          required
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-sm">
                          <label className="block font-button-text text-button-text text-on-surface" htmlFor="token">
                            Personal Access Token
                          </label>
                          <a
                            href="https://github.com/settings/tokens"
                            target="_blank"
                            rel="noreferrer"
                            className="font-button-text text-[12px] text-secondary-container hover:underline"
                          >
                            Generate
                          </a>
                        </div>
                        <input
                          id="token"
                          type="password"
                          className="w-full input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow tracking-[0.2em] font-mono"
                          value={gitToken}
                          onChange={(e) => setGitToken(e.target.value)}
                          placeholder="ghp_xxxxxxxxxxxx"
                        />
                        <p className="font-body-md text-[12px] text-on-surface-variant mt-sm">
                          Required for GitHub clone and sync features. Leave blank to continue in local-only mode.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-md">
                      <button
                        type="button"
                        onClick={() => setStep("profile-selection")}
                        className="w-1/3 btn-secondary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
                      >
                        Sign in Later
                      </button>
                      <button
                        type="submit"
                        disabled={isPatValidating}
                        className="w-2/3 btn-primary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
                      >
                        {isPatValidating
                          ? "Validating..."
                          : gitToken.trim()
                            ? "Authorize & Sign In"
                            : "Continue in Local Mode"}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="animate-fade-slide">
                  <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">Configure Custom Client ID</h2>
                  <p className="font-body-lg text-body-lg text-on-surface-variant mb-lg">
                    Link your own GitHub Application to customize the branding on the authorization page.
                  </p>

                  <div className="border border-outline-variant rounded-xl p-md bg-surface-container/50 mb-xl text-[13px] text-on-surface-variant flex flex-col gap-sm">
                    <div className="font-semibold text-on-surface mb-xs">Setup Instructions:</div>
                    <div>
                      1. Open the{" "}
                      <a
                        href="https://github.com/settings/applications/new"
                        target="_blank"
                        rel="noreferrer"
                        className="text-secondary-container hover:underline font-medium"
                      >
                        GitHub Register Application page
                      </a>{" "}
                      in a new tab.
                    </div>
                    <div>
                      2. Set the following fields in GitHub:
                      <div className="mt-xs pl-sm border-l-2 border-outline-variant flex flex-col gap-xs font-mono text-[11px] bg-background/50 p-xs rounded">
                        <div>Application Name: <span className="text-on-surface">OmniSync (Local)</span></div>
                        <div>Homepage URL: <span className="text-on-surface">{typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}</span></div>
                        <div>Authorization Callback URL: <span className="text-on-surface">{typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/auth/callback/github</span></div>
                      </div>
                    </div>
                    <div>
                      3. Register the application, and on the App settings page, make sure to check **Enable Device Flow**.
                    </div>
                    <div>
                      4. Copy the public <span className="font-semibold text-on-surface">Client ID</span> and paste it below (no Client Secret is needed for Device Flow).
                    </div>
                  </div>

                  <form onSubmit={handleSaveOauthConfig}>
                    <div className="flex flex-col gap-lg mb-xl">
                      <div>
                        <label className="block font-button-text text-button-text text-on-surface mb-sm" htmlFor="clientId">
                          Client ID
                        </label>
                        <input
                          id="clientId"
                          type="text"
                          className="w-full input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow font-mono"
                          value={inputClientId}
                          onChange={(e) => setInputClientId(e.target.value)}
                          placeholder="e.g. Iv1.1234567890abcdef"
                          required
                        />
                      </div>
                    </div>

                    {oauthConfigError && (
                      <div className="flash flash-danger text-[12px] mb-lg py-xs px-sm rounded">
                        {oauthConfigError}
                      </div>
                    )}

                    <div className="flex gap-md">
                      <button
                        type="button"
                        onClick={() => {
                          setShowOauthConfigForm(false);
                          setOauthConfigError("");
                        }}
                        className="w-1/3 btn-secondary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingOauthConfig}
                        className="w-2/3 btn-primary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
                      >
                        {isSavingOauthConfig ? "Saving & Connecting..." : "Save & Authenticate"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: WORKSPACE PROFILE SELECTION */}
          {step === "profile-selection" && (
            <div>
               <div className="mb-lg">
                <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">Select Workspace</h2>
                <p className="font-body-lg text-body-lg text-on-surface-variant">
                  Choose a previously set up repository workspace or initialize a new one.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md mb-xl">
                {profilesList.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleProfileSelect(p.id)}
                    className="border border-outline-variant rounded-xl p-md bg-surface-container flex flex-col justify-between min-h-[140px] cursor-pointer hover:border-secondary-container hover:shadow-lg transition-all duration-200"
                  >
                    <div>
                      <div className="flex items-center gap-sm mb-sm">
                        <div className="w-8 h-8 rounded-lg bg-accent-bg text-secondary-container flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        </div>
                        <div className="min-w-0">
                          <div className="font-button-text text-on-surface truncate font-semibold">{p.name}</div>
                          <div className="text-[11px] text-on-surface-variant">Local Folder</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-on-surface-variant break-all line-clamp-2 leading-relaxed">
                        {p.workspacePath || "No path set"}
                      </div>
                    </div>
                    <div className="text-[12px] text-secondary-container font-semibold text-right mt-sm">
                      Launch →
                    </div>
                  </div>
                ))}

                <div
                  onClick={() => {
                    setStep("repo-selection");
                    setRepoName("");
                    setCloneStatus("idle");
                    setCloneError("");
                    setCloneLogs([]);
                    setManualScanResult(null);
                  }}
                  className="border-2 border-dashed border-outline-variant rounded-xl p-md flex flex-col items-center justify-center min-h-[140px] cursor-pointer hover:border-secondary-container hover:bg-surface-container/30 transition-all duration-200"
                >
                  <div className="text-2xl text-on-surface-variant mb-xs">+</div>
                  <div className="font-button-text text-on-surface-variant font-medium text-center">
                    Set up new repository
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: REPOSITORY SELECTION & CONFIGURATION */}
          {step === "repo-selection" && (
            <div>
              <div className="mb-lg">
                <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">
                  {setupMode === "clone" ? "Clone GitHub Repository" : "Link Local Repository"}
                </h2>
                <p className="font-body-lg text-body-lg text-on-surface-variant">
                  {setupMode === "clone"
                    ? "Clone a repository from your GitHub account and prepare a local workspace."
                    : "Point OmniSync directly to an already created repository on this machine."}
                </p>
              </div>

              {/* Tab Switcher if a GitHub connection is available */}
              {githubConnected && (
                <div className="flex bg-surface-container-high p-xs rounded-xl mb-lg w-full max-w-[340px] border border-outline-variant/30 gap-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSetupMode("clone");
                      setManualError("");
                      setCloneError("");
                    }}
                    className={`flex-1 flex justify-center items-center py-sm rounded-lg font-button-text font-semibold text-[13px] transition-all cursor-pointer border-0 ${
                      setupMode === "clone"
                        ? "bg-primary text-on-primary shadow-sm"
                        : "bg-transparent text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Clone from GitHub
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSetupMode("local");
                      setManualError("");
                      setCloneError("");
                    }}
                    className={`flex-1 flex justify-center items-center py-sm rounded-lg font-button-text font-semibold text-[13px] transition-all cursor-pointer border-0 ${
                      setupMode === "local"
                        ? "bg-primary text-on-primary shadow-sm"
                        : "bg-transparent text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Link Local Folder
                  </button>
                </div>
              )}

              {/* CLONE MODE CONTENT */}
              {setupMode === "clone" && githubConnected && (
                <div>
                  {isFetchingRepos ? (
                    <div className="flex flex-col items-center justify-center py-xl gap-sm border border-outline-variant rounded-xl bg-surface-container/50">
                      <div className="w-8 h-8 border-3 border-[#58a6ff]/10 border-t-[#58a6ff] rounded-full animate-spin"></div>
                      <span className="text-[13px] text-on-surface-variant">Fetching your GitHub repositories...</span>
                    </div>
                  ) : reposList.length === 0 ? (
                    <div className="py-xl text-center text-on-surface-variant text-[14px] border border-outline-variant rounded-xl bg-surface-container/50">
                      No repositories found. Make sure your account has accessible repositories.
                    </div>
                  ) : (
                    <div className="border border-outline-variant rounded-xl p-lg bg-surface-container">
                      <h3 className="font-headline-sm text-on-surface mb-xs">Clone Remote Repository</h3>
                      <p className="font-body-md text-[13px] text-on-surface-variant mb-lg">
                        Select a repository and choose where to save the files on this computer.
                      </p>

                      <div className="mb-lg relative">
                        <label className="block font-button-text text-button-text text-on-surface mb-sm">
                          Repository
                        </label>
                        
                        {/* Custom Dropdown Trigger */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
                            disabled={cloneStatus === "cloning" || cloneStatus === "success"}
                            className="w-full input-surface rounded-md px-md py-sm text-on-surface font-body-md bg-background border border-outline-variant flex justify-between items-center cursor-pointer select-none text-left min-h-[38px] disabled:cursor-not-allowed"
                          >
                            {(() => {
                              const selectedRepo = reposList.find(r => r.id.toString() === selectedRepoId);
                              if (!selectedRepo) return <span className="text-on-surface-variant">Select a repository</span>;
                              return (
                                <span className="flex items-center gap-xs truncate">
                                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">
                                    {selectedRepo.private ? "lock" : "public"}
                                  </span>
                                  <span className="truncate">{selectedRepo.fullName}</span>
                                </span>
                              );
                            })()}
                            {/* Positioned slightly left as requested */}
                            <span className="material-symbols-outlined text-on-surface-variant text-[18px] mr-xs shrink-0">
                              keyboard_arrow_down
                            </span>
                          </button>
                          
                          {/* Dropdown Options Overlay */}
                          {isRepoDropdownOpen && (
                            <>
                              {/* Invisible Backdrop to close dropdown */}
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setIsRepoDropdownOpen(false)}
                              />
                              <div className="absolute left-0 right-0 mt-xs bg-surface-container border border-outline-variant rounded-lg shadow-xl max-h-[220px] overflow-y-auto z-20 p-xs flex flex-col gap-[2px]">
                                {reposList.map((repo) => {
                                  const isSelected = repo.id.toString() === selectedRepoId;
                                  return (
                                    <button
                                      key={repo.id}
                                      type="button"
                                      onClick={() => {
                                        handleRepoChange(repo.id.toString());
                                        setIsRepoDropdownOpen(false);
                                      }}
                                      className={`w-full flex items-center justify-between px-md py-sm rounded-md font-body-md text-left transition-colors cursor-pointer border-0 ${
                                        isSelected
                                          ? "bg-accent-bg text-accent-fg font-semibold"
                                          : "bg-transparent text-on-surface hover:bg-surface-container-high"
                                      }`}
                                    >
                                      <span className="flex items-center gap-xs truncate">
                                        <span className={`material-symbols-outlined text-[16px] shrink-0 ${isSelected ? "text-accent-fg" : "text-on-surface-variant"}`}>
                                          {repo.private ? "lock" : "public"}
                                        </span>
                                        <span className="truncate">{repo.fullName}</span>
                                      </span>
                                      {isSelected && (
                                        <span className="material-symbols-outlined text-[16px] text-accent-fg shrink-0">
                                          check
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mb-lg">
                        <label className="block font-button-text text-button-text text-on-surface mb-sm" htmlFor="clone-path">
                          Local Target Folder Path
                        </label>
                        <div className="flex gap-sm items-center">
                          <input
                            id="clone-path"
                            type="text"
                            className="flex-grow input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow"
                            value={clonePath}
                            onChange={(e) => {
                              setClonePath(e.target.value);
                              setCloneError("");
                              setCloneStatus("idle");
                            }}
                            placeholder="/Users/username/Documents/GitHub/project"
                            required
                            disabled={cloneStatus === "cloning" || cloneStatus === "success"}
                          />
                          {typeof window !== "undefined" && window.electron && (
                            <button
                              type="button"
                              onClick={handleChooseClonePath}
                              disabled={cloneStatus === "cloning" || cloneStatus === "success"}
                              className="btn-secondary rounded-lg py-sm px-md shrink-0 flex items-center font-semibold text-xs h-[38px] cursor-pointer"
                            >
                              Browse...
                            </button>
                          )}
                        </div>
                        <p className="font-body-md text-[11px] text-on-surface-variant mt-xs">
                          Choose an empty or new folder location. Parent directory will be created if needed.
                        </p>
                      </div>

                      {(cloneStatus === "idle" || cloneStatus === "error") && (
                        <button
                          type="button"
                          className="w-full btn-primary rounded-lg py-md px-md font-button-text text-button-text transition-colors cursor-pointer font-semibold"
                          onClick={runCloneAndSetup}
                        >
                          Clone &amp; Setup Workspace
                        </button>
                      )}

                      {cloneStatus === "cloning" && (
                        <div className="flex flex-col gap-md mt-md">
                          <div className="flex items-center gap-sm p-sm bg-surface-container rounded-lg border border-outline-variant/60">
                            <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                            <span className="text-[13px] text-on-surface font-medium">
                              Cloning repository &amp; configuring diagnostics...
                            </span>
                          </div>
                          
                          <div className="bg-[#090d13] border border-outline-variant rounded-lg p-md font-mono text-[11px] text-[#3fb950] h-[220px] overflow-y-auto flex flex-col gap-[3px] select-text scrollbar-thin">
                            {cloneLogs.map((log, idx) => (
                              <div key={idx} className="leading-relaxed whitespace-pre-wrap">{log}</div>
                            ))}
                            <div ref={terminalEndRef} />
                          </div>
                        </div>
                      )}

                      {cloneStatus === "success" && manualScanResult && (
                        <div className="flex flex-col gap-md mt-md animate-fade-in">
                          <div className="flash flash-success m-0 py-sm px-md text-[12px] rounded">
                            Workspace cloned and verified successfully. Click below to launch.
                          </div>

                          <table className="w-full border-collapse text-[12px] text-on-surface">
                            <tbody>
                              <tr className="border-b border-outline-variant">
                                <td className="py-sm text-on-surface-variant">Node.js Compatibility</td>
                                <td className="py-sm text-right">
                                  {manualScanResult.isNodeCompatible ? (
                                    <span className="badge badge-success">Compatible ({manualScanResult.nodeVersion})</span>
                                  ) : (
                                    <span className="badge badge-danger">Incompatible ({manualScanResult.nodeVersion})</span>
                                  )}
                                </td>
                              </tr>
                              <tr className="border-b border-outline-variant">
                                <td className="py-sm text-on-surface-variant">Dependencies Checked</td>
                                <td className="py-sm text-right font-medium">
                                  {manualScanResult.missingDependencies.length === 0
                                    ? "All verified"
                                    : `${manualScanResult.missingDependencies.length} missing`}
                                </td>
                              </tr>
                            </tbody>
                          </table>

                          <button
                            type="button"
                            className="w-full btn-primary rounded-lg py-md px-md font-button-text text-button-text transition-colors cursor-pointer font-semibold"
                            onClick={handleLaunchManual}
                          >
                            Launch Workspace
                          </button>
                        </div>
                      )}

                      {cloneError && (
                        <div className="flash flash-danger mt-md text-[12px] rounded">
                          {cloneError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* LOCAL MODE CONTENT */}
              {setupMode === "local" && (
                <div className="border border-outline-variant rounded-xl p-lg bg-surface-container">
                  <h3 className="font-headline-sm text-on-surface mb-xs">Link Local Repository</h3>
                  <p className="font-body-md text-[13px] text-on-surface-variant mb-lg">
                    Provide the directory path of an existing repository already created on your device.
                  </p>

                  <div className="mb-lg">
                    <label className="block font-button-text text-button-text text-on-surface mb-sm">
                      Pre-existing Folder Path
                    </label>
                    <div className="flex gap-sm items-center">
                      <input
                        type="text"
                        className="flex-grow input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow"
                        value={manualPath}
                        onChange={(e) => {
                          setManualPath(e.target.value);
                          setManualError("");
                          setManualStatus("idle");
                        }}
                        placeholder="/Users/username/Documents/GitHub/project"
                        required
                      />
                      {typeof window !== "undefined" && window.electron && (
                        <button
                          type="button"
                          onClick={handleChooseManualPath}
                          className="btn-secondary rounded-lg py-sm px-md shrink-0 flex items-center font-semibold text-xs h-[38px] cursor-pointer"
                        >
                          Browse...
                        </button>
                      )}
                    </div>
                    <p className="font-body-md text-[11px] text-on-surface-variant mt-xs">
                      OmniSync will verify this path, scan its Node compatibility, and configure logs.
                    </p>
                  </div>

                  {manualStatus === "idle" && (
                    <button
                      type="button"
                      className="w-full btn-primary rounded-lg py-md px-md font-button-text text-button-text transition-colors cursor-pointer font-semibold"
                      onClick={runManualScan}
                    >
                      Verify &amp; Scan Directory
                    </button>
                  )}

                  {manualStatus === "scanning" && (
                    <div className="flex items-center gap-sm p-md bg-surface rounded-lg border border-outline-variant">
                      <div className="w-5 h-5 border-2 border-[#58a6ff]/10 border-t-[#58a6ff] rounded-full animate-spin"></div>
                      <span className="text-[13px] text-on-surface-variant">
                        Analyzing node compatibility levels and package.json configurations...
                      </span>
                    </div>
                  )}

                  {manualStatus === "success" && manualScanResult && (
                    <div className="flex flex-col gap-md mt-md">
                      <div className="flash flash-success m-0 py-sm px-md text-[12px] rounded">
                        Workspace verified successfully. Click below to launch.
                      </div>

                      <table className="w-full border-collapse text-[12px] text-on-surface">
                        <tbody>
                          <tr className="border-b border-outline-variant">
                            <td className="py-sm text-on-surface-variant">Node.js Compatibility</td>
                            <td className="py-sm text-right">
                              {manualScanResult.isNodeCompatible ? (
                                <span className="badge badge-success">Compatible ({manualScanResult.nodeVersion})</span>
                              ) : (
                                <span className="badge badge-danger">Incompatible ({manualScanResult.nodeVersion})</span>
                              )}
                            </td>
                          </tr>
                          <tr className="border-b border-outline-variant">
                            <td className="py-sm text-on-surface-variant">Dependencies Checked</td>
                            <td className="py-sm text-right font-medium">
                              {manualScanResult.missingDependencies.length === 0
                                ? "All verified"
                                : `${manualScanResult.missingDependencies.length} missing`}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <button
                        type="button"
                        className="w-full btn-primary rounded-lg py-md px-md font-button-text text-button-text transition-colors cursor-pointer font-semibold"
                        onClick={handleLaunchManual}
                      >
                        Launch Workspace
                      </button>
                    </div>
                  )}

                  {manualError && (
                    <div className="flash flash-danger mt-md text-[12px] rounded">
                      {manualError}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center mt-xl">
                <button
                  type="button"
                  className="btn-secondary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
                  onClick={() => setStep("profile-selection")}
                  disabled={manualStatus === "scanning" || cloneStatus === "cloning"}
                >
                  Back to Workspaces
                </button>
              </div>
            </div>
          )}

          </div>
        </div>
      </div>

      {/* Main Settings & Documentation Modal */}
      {isSettingsOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(10, 12, 16, 0.85)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          backdropFilter: "blur(4px)",
        }}>
          <div className="card animate-fade-slide" style={{
            width: "90%",
            maxWidth: "680px",
            height: "80vh",
            backgroundColor: "var(--color-bg-overlay)",
            border: "1px solid var(--color-border-default)",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border-default)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "var(--color-bg-subtle)",
            }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#ffffff" }}>
                  Main Settings &amp; Documentation
                </h3>
                <p style={{ fontSize: "11px", color: "var(--color-fg-muted)", margin: "2px 0 0 0" }}>
                  Learn how to use OmniSync and configure preferences.
                </p>
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setIsSettingsOpen(false)}
                style={{ minWidth: "32px", height: "32px", padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation & Content Layout (Sidebar style) */}
            <div style={{
              display: "flex",
              flex: 1,
              overflow: "hidden",
            }}>
              {/* Left Sidebar */}
              <div style={{
                width: "180px",
                borderRight: "1px solid var(--color-border-default)",
                backgroundColor: "var(--color-bg-default)",
                display: "flex",
                flexDirection: "column",
                padding: "12px",
                gap: "6px",
                flexShrink: 0,
              }}>
                {[
                  { id: "global-settings", label: "Global Preferences" },
                  { id: "git-config", label: "Git Configuration" },
                  { id: "app-docs", label: "App Documentation" },
                  { id: "tour-cache", label: "Reset Preferences" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSettingsTab(tab.id as any)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: settingsTab === tab.id ? "var(--color-bg-active)" : "none",
                      border: "none",
                      color: settingsTab === tab.id ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                      fontWeight: settingsTab === tab.id ? 600 : 500,
                      fontSize: "12px",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      transition: "background 0.2s",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Right Content Area */}
              <div style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px",
                backgroundColor: "var(--color-bg-overlay)",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}>
                {settingsTab === "global-settings" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-accent-fg)", margin: 0 }}>
                      System Preferences
                    </h3>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>
                        Active Terminal Shell
                      </label>
                      <select
                        value={terminalShell}
                        onChange={(e) => setTerminalShell(e.target.value)}
                        className="form-control"
                        style={{ width: "100%", padding: "6px", fontSize: "12px", borderRadius: "6px", backgroundColor: "var(--color-bg-default)", border: "1px solid var(--color-border-default)", color: "var(--color-fg-default)" }}
                      >
                        <option value="zsh">zsh (macOS Default)</option>
                        <option value="bash">bash</option>
                        <option value="sh">sh</option>
                      </select>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>
                        Theme Accent Color
                      </label>
                      <select
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="form-control"
                        style={{ width: "100%", padding: "6px", fontSize: "12px", borderRadius: "6px", backgroundColor: "var(--color-bg-default)", border: "1px solid var(--color-border-default)", color: "var(--color-fg-default)" }}
                      >
                        <option value="default">Default Steel Blue</option>
                        <option value="emerald">Emerald Green</option>
                        <option value="royal">Royal Purple</option>
                        <option value="sunset">Sunset Orange</option>
                      </select>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 600 }}>Show Hidden Files</div>
                        <div style={{ fontSize: "10px", color: "var(--color-fg-muted)" }}>Toggle visibility of files starting with dots (e.g. .env, .gitignore)</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={showHiddenFiles}
                        onChange={(e) => setShowHiddenFiles(e.target.checked)}
                        style={{ cursor: "pointer", width: "16px", height: "16px" }}
                      />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 600 }}>Anonymous Telemetry</div>
                        <div style={{ fontSize: "10px", color: "var(--color-fg-muted)" }}>Share workspace diagnostics reports to help improve OmniSync</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={enableTelemetry}
                        onChange={(e) => setEnableTelemetry(e.target.checked)}
                        style={{ cursor: "pointer", width: "16px", height: "16px" }}
                      />
                    </div>

                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={handleSaveGlobalSettings}
                      style={{ marginTop: "12px", alignSelf: "flex-end" }}
                    >
                      Save Preferences
                    </button>
                  </div>
                )}

                {settingsTab === "git-config" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-accent-fg)", margin: 0 }}>
                      Global Git Configuration
                    </h3>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>
                        Git Author Username
                      </label>
                      <input
                        type="text"
                        value={globalGitUsername}
                        onChange={(e) => setGlobalGitUsername(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="form-control"
                        style={{ width: "100%", padding: "6px 10px", fontSize: "12px", borderRadius: "6px", backgroundColor: "var(--color-bg-default)", border: "1px solid var(--color-border-default)", color: "var(--color-fg-default)" }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>
                        Git Author Email
                      </label>
                      <input
                        type="email"
                        value={globalGitEmail}
                        onChange={(e) => setGlobalGitEmail(e.target.value)}
                        placeholder="e.g. johndoe@example.com"
                        className="form-control"
                        style={{ width: "100%", padding: "6px 10px", fontSize: "12px", borderRadius: "6px", backgroundColor: "var(--color-bg-default)", border: "1px solid var(--color-border-default)", color: "var(--color-fg-default)" }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>
                        Default Branch Name
                      </label>
                      <input
                        type="text"
                        value={defaultBranch}
                        onChange={(e) => setDefaultBranch(e.target.value)}
                        placeholder="e.g. main"
                        className="form-control"
                        style={{ width: "100%", padding: "6px 10px", fontSize: "12px", borderRadius: "6px", backgroundColor: "var(--color-bg-default)", border: "1px solid var(--color-border-default)", color: "var(--color-fg-default)" }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>
                        Auto-Fetch Frequency
                      </label>
                      <select
                        value={autoFetchInterval}
                        onChange={(e) => setAutoFetchInterval(e.target.value)}
                        className="form-control"
                        style={{ width: "100%", padding: "6px", fontSize: "12px", borderRadius: "6px", backgroundColor: "var(--color-bg-default)", border: "1px solid var(--color-border-default)", color: "var(--color-fg-default)" }}
                      >
                        <option value="0">Never (Manual Sync)</option>
                        <option value="1">Every 1 minute</option>
                        <option value="5">Every 5 minutes</option>
                        <option value="15">Every 15 minutes</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={handleSaveGlobalSettings}
                      style={{ marginTop: "12px", alignSelf: "flex-end" }}
                    >
                      Save Git Configuration
                    </button>
                  </div>
                )}

                {settingsTab === "app-docs" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-accent-fg)", margin: 0 }}>
                      OmniSync Developer Manual
                    </h3>

                    <div>
                      <h4 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 4px 0", color: "#ffffff" }}>
                        Repository Setup &amp; Workspaces
                      </h4>
                      <p style={{ fontSize: "12px", color: "var(--color-fg-default)", margin: 0, lineHeight: "1.6" }}>
                        OmniSync enables you to map local repositories or clone from remote GitHub accounts. Once set up, the application scans the workspace directory for your package configurations, dev dependencies, and runtime script command details.
                      </p>
                    </div>

                    <div>
                      <h4 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 4px 0", color: "#ffffff" }}>
                        Live Diagnostics Engine
                      </h4>
                      <p style={{ fontSize: "12px", color: "var(--color-fg-default)", margin: 0, lineHeight: "1.6" }}>
                        Check node engine limitations and verify package compiler builds. The diagnostics engine runs automated diagnostic scans to detect missing packages or incompatible runtimes and provides safe recovery repairs.
                      </p>
                    </div>

                    <div>
                      <h4 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 4px 0", color: "#ffffff" }}>
                        Three-Pane Visual Merge Resolver
                      </h4>
                      <p style={{ fontSize: "12px", color: "var(--color-fg-default)", margin: 0, lineHeight: "1.6" }}>
                        When merge conflicts arise, OmniSync provides an interactive three-pane dashboard. It renders the Current Change (Ours) on the left, the Incoming Change (Theirs) on the right, and the Resulting Code in the center. Click block accept buttons to resolve segments quickly.
                      </p>
                    </div>

                    <div>
                      <h4 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 4px 0", color: "#ffffff" }}>
                        Git Branch Node Synchronization
                      </h4>
                      <p style={{ fontSize: "12px", color: "var(--color-fg-default)", margin: 0, lineHeight: "1.6" }}>
                        Toggle branch nodes on-the-fly and execute repository fetches. OmniSync calculates upstream diffs (commits ahead and behind) to help you keep local files perfectly synchronized with your remotes.
                      </p>
                    </div>
                  </div>
                )}

                {settingsTab === "tour-cache" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-accent-fg)", margin: 0 }}>
                      Reset Onboarding &amp; Tour
                    </h3>

                    <div className="card" style={{ padding: "16px", backgroundColor: "rgba(22,27,34,0.4)", display: "flex", flexDirection: "column", gap: "12px", borderRadius: "8px", border: "1px solid var(--color-border-default)" }}>
                      <h4 style={{ fontSize: "13px", fontWeight: 700, margin: 0, color: "#ffffff" }}>
                        Onboarding Preferences
                      </h4>
                      <p style={{ fontSize: "12px", color: "var(--color-fg-muted)", margin: 0 }}>
                        Reset guided onboarding tours and animations to play on the next workspace entry.
                      </p>

                      <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            localStorage.removeItem("omnisync_global_tour_shown");
                            localStorage.removeItem("omnisync_tour_completed");
                            alert("Guided tour has been reset! It will automatically start upon launching your next workspace.");
                          }}
                        >
                          Reset Product Tour
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            sessionStorage.removeItem("omnisync_splash_shown");
                            alert("First launch animation has been reset! It will play on your next app refresh.");
                          }}
                        >
                          Reset Splash Screen
                        </button>
                      </div>
                    </div>

                    <div className="card" style={{ padding: "16px", backgroundColor: "rgba(22,27,34,0.4)", borderRadius: "8px", border: "1px solid var(--color-border-default)" }}>
                      <h4 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 8px 0", color: "#ffffff" }}>
                        Active Theme
                      </h4>
                      <p style={{ fontSize: "12px", color: "var(--color-fg-default)", margin: 0 }}>
                        System theme is set to <strong>GitHub Dark Mode (Default)</strong>. To change theme configuration, link a light mode workspace profile.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--color-border-default)",
              display: "flex",
              justifyContent: "flex-end",
              backgroundColor: "var(--color-bg-subtle)",
              flexShrink: 0,
            }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setIsSettingsOpen(false)}
                style={{ width: "80px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* GITHUB DEVICE FLOW MODAL */}
      {isOAuthModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-lg animate-fade-in">
          <div className="animate-fade-slide bg-[#161b22] border border-[#30363d] rounded-2xl w-[500px] max-w-full shadow-2xl p-xl relative flex flex-col items-center select-none text-center gap-lg">
            {/* Absolute Close Button */}
            <button
              type="button"
              onClick={() => {
                setIsOAuthModalOpen(false);
                setOauthState("idle");
              }}
              className="absolute top-5 right-5 text-[#8b949e] hover:text-[#c9d1d9] transition-colors bg-transparent border-0 cursor-pointer p-1"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* GitHub Header Icon */}
            <div className="w-14 h-14 rounded-xl bg-[#24292e] flex items-center justify-center border border-[#30363d] shadow-sm mt-2">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
              </svg>
            </div>

            {/* Header Text */}
            <div className="flex flex-col gap-1 w-full">
              <h3 className="text-2xl font-bold text-[#f0f6fc]">
                Link GitHub Account
              </h3>
              <p className="text-sm text-[#8b949e] px-lg">
                Enter this verification code on GitHub to authorize OmniSync.
              </p>
            </div>

            {/* Modal Body */}
            <div className="w-full flex flex-col items-center gap-lg">
              {oauthState === "success" ? (
                <div className="flex flex-col items-center gap-md py-lg w-full animate-fade-in">
                  <div className="text-5xl text-[#2ea44f] animate-bounce">✔</div>
                  <div className="text-center font-medium text-base text-[#f0f6fc]">
                    {oauthStatusText}
                  </div>
                </div>
              ) : oauthState === "authorizing" && userCode ? (
                <div className="w-full flex flex-col gap-lg items-center">
                  {/* Centered Middle-Aligned Clickable Code Copy Box */}
                  <div
                    onClick={() => {
                      navigator.clipboard.writeText(userCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 1500);
                    }}
                    className="w-full py-md px-lg bg-[#0d1117] border border-[#30363d] rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#58a6ff]/40 transition-all duration-150 select-none group"
                  >
                    <span className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider mb-1">Verification Code</span>
                    <span className="font-mono text-3xl font-extrabold tracking-widest text-[#58a6ff] group-hover:scale-102 transition-transform">{userCode}</span>
                    <span className="text-xs text-[#8b949e] mt-1.5 font-medium group-hover:text-[#c9d1d9] transition-colors">
                      {copiedCode ? "Copied! ✓" : "Click code to copy"}
                    </span>
                  </div>

                  {/* Open GitHub Link */}
                  <a
                    href={verificationUri}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full text-center py-md bg-[#238636] hover:bg-[#2ea44f] text-white rounded-xl text-base font-semibold cursor-pointer transition-colors no-underline shadow-md flex items-center justify-center gap-sm"
                  >
                    <span>Authorize on GitHub</span>
                    <span className="text-xs">➔</span>
                  </a>

                  {/* Centered Active listening status indicator */}
                  <div className="flex items-center gap-sm justify-center text-xs text-[#8b949e] select-none py-xs w-full">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#58a6ff] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#58a6ff]"></span>
                    </span>
                    <span>{oauthStatusText}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-md py-lg w-full">
                  <div className="w-10 h-10 border-3 border-[#58a6ff]/10 border-t-[#58a6ff] rounded-full animate-spin"></div>
                  <div className="text-center font-medium text-sm text-[#f0f6fc]">
                    {oauthStatusText}
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <p className="text-xs text-[#8b949e]/50 text-center leading-relaxed pt-md border-t border-[#30363d]/30 w-full select-none">
                By authorizing, you allow OmniSync to store security tokens locally.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

