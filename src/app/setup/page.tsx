"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter as useAppRouter } from "next/navigation";
import { UserProfile } from "@/lib/profiles";
import GitHubConnectModal from "@/components/GitHubConnectModal";
import GitHubConnectedBadge from "@/components/GitHubConnectedBadge";
import SystemPermissionsPrompt from "@/components/SystemPermissionsPrompt";
import DevToolsSetupPrompt from "@/components/DevToolsSetupPrompt";
import LoginStep from "@/components/setup/LoginStep";
import ProfileSelectionStep from "@/components/setup/ProfileSelectionStep";
import RepoSelectionStep from "@/components/setup/RepoSelectionStep";
import type { DiagnosticScanResult, GithubUserDetail, UIRepository } from "@/components/setup/types";
import { useGithubOAuth } from "@/hooks/useGithubOAuth";
import {
  isLocalOnlyMode,
  markLocalOnlyMode,
  markWorkspaceReady,
} from "@/lib/launchSession";

export default function SetupPage() {
  const router = useAppRouter();

  const [step, setStep] = useState<"login" | "profile-selection" | "repo-selection">("login");

  const [gitUsername, setGitUsername] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubUserDetail, setGithubUserDetail] = useState<GithubUserDetail | null>(null);
  const [isPatValidating, setIsPatValidating] = useState(false);
  const [manualPath, setManualPath] = useState("");

  const handleOAuthSuccess = useCallback(async (data: { username: string; avatarUrl?: string }) => {
    setGitUsername(data.username);
    setGitToken("");
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
    setStep("profile-selection");
  }, []);

  const oauth = useGithubOAuth({ onAuthSuccess: handleOAuthSuccess });

  const handleLogout = async () => {
    try {
      await fetch("/api/github/session", { method: "DELETE" });
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

  const [profilesList, setProfilesList] = useState<UserProfile[]>([]);
  const [repoName, setRepoName] = useState("");

  const [manualStatus, setManualStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [manualScanResult, setManualScanResult] = useState<DiagnosticScanResult | null>(null);
  const [manualError, setManualError] = useState("");

  const [setupMode, setSetupMode] = useState<"clone" | "local">("clone");
  const [reposList, setReposList] = useState<UIRepository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [clonePath, setClonePath] = useState("");
  const [defaultCloneParent, setDefaultCloneParent] = useState("");
  const [pathPlaceholder, setPathPlaceholder] = useState("~/Documents/GitHub/project");
  const [cloneStatus, setCloneStatus] = useState<"idle" | "cloning" | "success" | "error">("idle");
  const [cloneError, setCloneError] = useState("");
  const [cloneLogs, setCloneLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [cloneLogs]);

  useEffect(() => {
    fetch("/api/system/paths")
      .then((res) => res.json())
      .then((data) => {
        if (data.defaultCloneParent) {
          setDefaultCloneParent(data.defaultCloneParent);
          setPathPlaceholder(`${data.defaultCloneParent}/project`);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    if (step === "repo-selection") {
      Promise.resolve().then(async () => {
        if (!active) return;

        let cloneParent = defaultCloneParent;
        if (!cloneParent) {
          try {
            const pathsRes = await fetch("/api/system/paths");
            const pathsData = await pathsRes.json();
            if (pathsData.defaultCloneParent) {
              cloneParent = pathsData.defaultCloneParent;
              setDefaultCloneParent(cloneParent);
              setPathPlaceholder(`${cloneParent}/project`);
            }
          } catch {}
        }

        if (githubConnected) {
          setSetupMode("clone");
          setIsFetchingRepos(true);
          try {
            const res = await fetch("/api/github/repos");
            const data = await res.json();
            if (!active) return;
            if (data.repos) {
              setReposList(data.repos as UIRepository[]);
              if (data.repos.length > 0) {
                const firstRepo = data.repos[0];
                setSelectedRepoId(firstRepo.id.toString());
                if (cloneParent) {
                  setClonePath(`${cloneParent}/${firstRepo.name}`);
                }
              }
            } else {
              setReposList([]);
            }
          } catch (err) {
            console.error(err);
            if (active) setReposList([]);
          } finally {
            if (active) setIsFetchingRepos(false);
          }
        } else {
          setSetupMode("local");
        }
      });
    }
    return () => {
      active = false;
    };
  }, [step, githubConnected]);

  const handleRepoChange = (repoId: string) => {
    setSelectedRepoId(repoId);
    setCloneError("");
    setCloneStatus("idle");
    const repo = reposList.find((r) => r.id.toString() === repoId);
    if (repo) {
      const parentFromPath = clonePath.includes("/")
        ? clonePath.substring(0, clonePath.lastIndexOf("/"))
        : "";
      const defaultParent = parentFromPath || defaultCloneParent;
      if (defaultParent) {
        setClonePath(`${defaultParent}/${repo.name}`);
      }
    }
  };

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
      const cloneRes = await fetch("/api/github/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloneUrl: repo.cloneUrl,
          localPath: clonePath,
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

      const workspaceRecordName = repoName || repo.name;
      const profRes = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: workspaceRecordName,
          profession: "Developer Workspace",
        }),
      });

      const profData = await profRes.json();
      if (!profData.success) {
        throw new Error(profData.error || "Failed to initialize workspace record");
      }

      const newProfile = profData.profile as UserProfile;

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

      const diagRes = await fetch("/api/workspace/diagnostics");
      const diagData = await diagRes.json();

      if (diagData.error) {
        throw new Error(diagData.error);
      }

      setManualScanResult(diagData as DiagnosticScanResult);
      setManualStatus("success");
      setCloneStatus("success");
    } catch (err: unknown) {
      setCloneStatus("error");
      setCloneError(err instanceof Error ? err.message : "Failed to clone and setup workspace.");
    }
  };

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

  const loadProfiles = async () => {
    try {
      const res = await fetch("/api/profiles");
      const data = await res.json();
      const profiles = data.profiles || [];
      setProfilesList(profiles);

      const profileWithToken = profiles.find((p: UserProfile) => p.hasGitToken);
      if (profileWithToken || data.githubConnected) {
        setGithubConnected(true);
        setGitUsername(profileWithToken?.name || "");
        fetchGithubUserDetail();
      }

      if (profiles.length > 0 || data.githubConnected || isLocalOnlyMode()) {
        setStep("profile-selection");
      }
    } catch {}
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      loadProfiles();
      oauth.checkOauthConfig();
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_success") === "true") {
      let username = "";
      let avatarUrl = "";
      try {
        username = sessionStorage.getItem("oauth_username") || "";
        avatarUrl = sessionStorage.getItem("oauth_avatar") || "";
        sessionStorage.removeItem("oauth_username");
        sessionStorage.removeItem("oauth_avatar");
      } catch (e) {
        console.error("sessionStorage read error:", e);
      }
      if (username) {
        Promise.resolve().then(() => {
          setGitUsername(username);
          setGitToken("");
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
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else if (params.get("oauth_error")) {
      alert(`GitHub Authentication Failed: ${params.get("oauth_error")}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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
        setGitToken("");
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
      // Continue without GitHub — remember local-only so next launch skips login.
      setGithubConnected(false);
      setGithubUserDetail(null);
      markLocalOnlyMode();
    }

    setManualPath(process.cwd());
    setStep("profile-selection");
  };

  const handleProfileSelect = async (profileId: string) => {
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", id: profileId }),
      });
      const data = await res.json();
      if (data.success) {
        markWorkspaceReady();
        router.push("/");
      } else {
        alert(`Error selecting workspace: ${data.error}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Error selecting workspace: ${msg}`);
    }
  };

  const runManualScan = async () => {
    if (!manualPath) {
      setManualError("Please specify a directory path");
      return;
    }

    setManualStatus("scanning");
    setManualError("");

    try {
      const workspaceRecordName = repoName || manualPath.split("/").pop() || "local-repo";
      const profRes = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: workspaceRecordName,
          profession: "Developer Workspace",
        }),
      });

      const profData = await profRes.json();
      if (!profData.success) {
        throw new Error(profData.error || "Failed to initialize workspace record");
      }

      const newProfile = profData.profile as UserProfile;

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
    markWorkspaceReady();
    router.push("/");
  };

  const handleSetupNewRepository = () => {
    setStep("repo-selection");
    setRepoName("");
    setCloneStatus("idle");
    setCloneError("");
    setCloneLogs([]);
    setManualScanResult(null);
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-screen overflow-hidden bg-surface text-on-surface">
      {step === "login" ? (
        <LoginStep
          gitUsername={gitUsername}
          setGitUsername={setGitUsername}
          gitToken={gitToken}
          setGitToken={setGitToken}
          isPatValidating={isPatValidating}
          onGitLogin={handleGitLogin}
          onGitHubSignIn={oauth.handleGitHubSignIn}
          onSkipToProfileSelection={() => {
            markLocalOnlyMode();
            setStep("profile-selection");
          }}
          showOauthConfigForm={oauth.showOauthConfigForm}
          setShowOauthConfigForm={oauth.setShowOauthConfigForm}
          oauthConfigured={oauth.oauthConfigured}
          githubClientId={oauth.githubClientId}
          inputClientId={oauth.inputClientId}
          setInputClientId={oauth.setInputClientId}
          isSavingOauthConfig={oauth.isSavingOauthConfig}
          oauthConfigError={oauth.oauthConfigError}
          setOauthConfigError={oauth.setOauthConfigError}
          onSaveOauthConfig={oauth.handleSaveOauthConfig}
        />
      ) : (
        <div className="w-full flex-1 bg-background flex flex-col overflow-hidden">
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src="/icon.png" alt="Logo" style={{ height: "20px", width: "20px", objectFit: "contain", borderRadius: "4px" }} />
              <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-fg-default)" }}>OmniSync Workspace Launcher</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {githubUserDetail && (
                <GitHubConnectedBadge
                  name={githubUserDetail.name}
                  login={githubUserDetail.login}
                  avatarUrl={githubUserDetail.avatarUrl}
                />
              )}

              <button
                className="btn btn-sm"
                onClick={() => router.push("/settings?return=/setup")}
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>settings</span>
                Settings
              </button>

              <button className="btn btn-sm btn-danger" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%" }}>
            <div className="w-full max-w-[640px] animate-fade-slide">
              <SystemPermissionsPrompt />

              {step === "profile-selection" && (
                <ProfileSelectionStep
                  profilesList={profilesList}
                  onProfileSelect={handleProfileSelect}
                  onSetupNewRepository={handleSetupNewRepository}
                />
              )}

              {step === "repo-selection" && (
                <RepoSelectionStep
                  setupMode={setupMode}
                  setSetupMode={setSetupMode}
                  githubConnected={githubConnected}
                  isFetchingRepos={isFetchingRepos}
                  reposList={reposList}
                  selectedRepoId={selectedRepoId}
                  isRepoDropdownOpen={isRepoDropdownOpen}
                  setIsRepoDropdownOpen={setIsRepoDropdownOpen}
                  clonePath={clonePath}
                  setClonePath={setClonePath}
                  pathPlaceholder={pathPlaceholder}
                  cloneStatus={cloneStatus}
                  cloneError={cloneError}
                  setCloneError={setCloneError}
                  setCloneStatus={setCloneStatus}
                  cloneLogs={cloneLogs}
                  terminalEndRef={terminalEndRef}
                  manualPath={manualPath}
                  setManualPath={setManualPath}
                  manualStatus={manualStatus}
                  manualError={manualError}
                  setManualError={setManualError}
                  setManualStatus={setManualStatus}
                  manualScanResult={manualScanResult}
                  onRepoChange={handleRepoChange}
                  onChooseClonePath={handleChooseClonePath}
                  onChooseManualPath={handleChooseManualPath}
                  onRunCloneAndSetup={runCloneAndSetup}
                  onRunManualScan={runManualScan}
                  onLaunch={handleLaunchManual}
                  onBackToWorkspaces={() => setStep("profile-selection")}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {oauth.isOAuthModalOpen && oauth.oauthState !== "idle" && (
        <GitHubConnectModal
          phase={oauth.oauthState === "success" ? "success" : "authorizing"}
          userCode={oauth.userCode}
          verificationUri={oauth.verificationUri}
          statusText={oauth.oauthStatusText}
          copiedCode={oauth.copiedCode}
          username={githubUserDetail?.login || gitUsername}
          displayName={githubUserDetail?.name}
          avatarUrl={githubUserDetail?.avatarUrl}
          onCopyCode={oauth.copyUserCode}
          onClose={oauth.closeOAuthModal}
        />
      )}

      {/* Persistent until Node, Git, and GitHub CLI are available */}
      {(step === "profile-selection" || step === "login") && <DevToolsSetupPrompt />}
    </div>
  );
}
