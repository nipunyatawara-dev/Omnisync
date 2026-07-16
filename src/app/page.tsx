"use client";

import { useState, useEffect } from "react";
import { useRouter as useAppRouter } from "next/navigation";
import Loader from "@/components/Loader";
import GitSyncView from "@/components/views/GitSyncView";
import SettingsPageView from "@/components/SettingsPageView";
import ProductTour from "@/components/ProductTour";
import DashboardShell from "@/components/views/DashboardShell";
import WorkspaceView from "@/components/views/WorkspaceView";
import DiagnosticsView from "@/components/views/DiagnosticsView";
import TimelineView from "@/components/views/TimelineView";
import { UserProfile } from "@/lib/profiles";
import { useGitSync } from "@/hooks/useGitSync";
import { useNotifications } from "@/hooks/useNotifications";
import { useWorkspaceFiles } from "@/hooks/useWorkspaceFiles";
import { useRunner } from "@/hooks/useRunner";
import { useDiagnostics } from "@/hooks/useDiagnostics";
import { useTimeline } from "@/hooks/useTimeline";
import { useDashboardTerminal } from "@/hooks/useDashboardTerminal";
import type { DashboardTab, DiagnosticDetails } from "@/types/dashboard";
import { clearWorkspaceReady, isWorkspaceReady } from "@/lib/launchSession";

export default function DashboardPage() {
  const router = useAppRouter();
  const [activeTab, setActiveTab] = useState<DashboardTab>("workspace");
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [tourOpen, setTourOpen] = useState(false);
  const [showGuideTourButton, setShowGuideTourButton] = useState(true);

  const { toast, dismissToast, showNotification } = useNotifications();

  const git = useGitSync(showNotification);
  const {
    syncStatus,
    branchProtected,
    autoFetchIntervalMinutes,
    isGitSyncing,
    gitSyncError,
    pullDiverged,
    conflictFiles,
    selectedConflictFile,
    setSelectedConflictFile,
    branches,
    currentBranch,
    setCurrentBranch,
    loadGitSyncStatus,
    loadGitBranches,
    loadConflictFiles,
    handleGitSync,
    handlePullStrategy,
  } = git;

  const workspace = useWorkspaceFiles(
    showNotification,
    setCurrentBranch,
    loadGitSyncStatus,
    setSelectedConflictFile
  );

  const diagnostics = useDiagnostics(showNotification, workspace.setGitChangesRefreshKey);

  const runner = useRunner(showNotification, activeProfile);

  const timeline = useTimeline();

  const dashboardTerminal = useDashboardTerminal();

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (localStorage.getItem("omnisync_hide_tour_button") === "true") {
        setShowGuideTourButton(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    async function loadProfile() {
      // Every app open should pick a workspace first (session flag is set after selection).
      if (!isWorkspaceReady()) {
        setIsLoadingProfile(false);
        router.replace("/setup");
        return;
      }

      try {
        const res = await fetch("/api/profiles");
        const data = await res.json();
        if (!data.activeProfileId || data.profiles.length === 0) {
          clearWorkspaceReady();
          router.replace("/setup");
          return;
        }
        const active = (data.profiles as UserProfile[]).find((p) => p.id === data.activeProfileId);
        if (!active || !active.workspacePath) {
          clearWorkspaceReady();
          router.replace("/setup");
          return;
        }
        setActiveProfile(active);
      } catch {
        clearWorkspaceReady();
        router.replace("/setup");
      } finally {
        setIsLoadingProfile(false);
      }
    }
    loadProfile();
  }, [router]);

  useEffect(() => {
    if (!activeProfile) return;

    Promise.resolve().then(async () => {
      workspace.loadWorkspaceFiles();
      loadGitBranches();
      loadGitSyncStatus();
      loadConflictFiles();
      timeline.loadAllCommits();
      runner.loadLaunchOptions();

      try {
        const res = await fetch("/api/workspace/diagnostics");
        const data = await res.json();
        diagnostics.setDiagData(data as DiagnosticDetails);
        diagnostics.checkAndInstallDependencies(
          data as DiagnosticDetails,
          activeProfile.workspacePath || activeProfile.id
        );
      } catch {}
    });
  }, [activeProfile]);

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
          await loadGitSyncStatus();
        }
      } catch {}
    }, intervalMs);

    return () => clearInterval(timer);
  }, [activeProfile, activeProfile?.autoFetch, autoFetchIntervalMinutes]);

  useEffect(() => {
    if (activeTab === "diagnostics") {
      Promise.resolve().then(() => {
        diagnostics.loadDiagnostics();
      });
    }
    if (activeTab === "git") {
      workspace.setGitChangesRefreshKey((key) => key + 1);
    }
    if (activeTab === "workspace") {
      workspace.loadWorkspaceFiles();
    }
  }, [activeTab]);

  const refreshAfterGitSync = (action: "fetch" | "pull" | "push") => {
    timeline.loadAllCommits();
    loadGitBranches();
    if (action === "pull") {
      workspace.loadWorkspaceFiles();
      workspace.setGitChangesRefreshKey((key) => key + 1);
    }
  };

  const refreshAfterPullStrategy = () => {
    timeline.loadAllCommits();
    workspace.loadWorkspaceFiles();
    workspace.setGitChangesRefreshKey((key) => key + 1);
  };

  const handleDismissTourButton = () => {
    setShowGuideTourButton(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("omnisync_hide_tour_button", "true");
    }
  };

  if (isLoadingProfile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "var(--color-bg-default)", gap: "16px" }}>
        <Loader size="lg" label="Synchronizing workspace" />
        <div className="animate-pulse" style={{ color: "var(--color-fg-muted)", fontSize: "14px", fontWeight: "500", letterSpacing: "-0.2px" }}>
          Synchronizing Workspace...
        </div>
      </div>
    );
  }

  return (
    <DashboardShell
      activeProfile={activeProfile}
      branchProtected={branchProtected}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      toast={toast}
      dismissToast={dismissToast}
      depInstallModal={diagnostics.depInstallModal}
      onDismissDepInstall={() => diagnostics.setDepInstallModal(null)}
      onRetryDepInstall={diagnostics.runDependencyInstall}
      showGuideTourButton={showGuideTourButton}
      onOpenTour={() => setTourOpen(true)}
      onDismissTourButton={handleDismissTourButton}
      onSwitchWorkspace={() => {
        clearWorkspaceReady();
        router.push("/setup");
      }}
      terminal={dashboardTerminal}
      footer={
        <ProductTour
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpenExternally={tourOpen}
          onCloseExternally={() => setTourOpen(false)}
        />
      }
    >
      {activeTab === "workspace" && (
        <WorkspaceView
          activeProfile={activeProfile}
          runnerStatus={runner.runnerStatus}
          isRunnerLoading={runner.isRunnerLoading}
          launchOptions={runner.launchOptions}
          branches={branches}
          currentBranch={currentBranch}
          isChangingBranch={workspace.isChangingBranch}
          isIdeDropdownOpen={runner.isIdeDropdownOpen}
          setIsIdeDropdownOpen={runner.setIsIdeDropdownOpen}
          fileTree={workspace.fileTree}
          activeFile={workspace.activeFile}
          openFiles={workspace.openFiles}
          fileContent={workspace.fileContent}
          isFileLoading={workspace.isFileLoading}
          leftWidth={workspace.leftWidth}
          rightWidth={workspace.rightWidth}
          isResizingLeft={workspace.isResizingLeft}
          isResizingRight={workspace.isResizingRight}
          onToggleRunner={runner.handleToggleRunner}
          onLaunchTarget={runner.handleLaunchTarget}
          onLaunchIde={runner.handleLaunchIde}
          onBranchChange={workspace.handleBranchChange}
          onSelectFile={workspace.handleSelectFile}
          onCloseFile={workspace.handleCloseFile}
          onExpandDirectory={workspace.loadDirectoryChildren}
          onRefreshFiles={workspace.loadWorkspaceFiles}
          onClearConflictSelection={() => setSelectedConflictFile(null)}
          startResizeLeft={workspace.startResizeLeft}
          startResizeRight={workspace.startResizeRight}
        />
      )}

      {activeTab === "git" && (
        <GitSyncView
          activeProfile={activeProfile}
          syncStatus={syncStatus}
          branchProtected={branchProtected}
          changesRefreshKey={workspace.gitChangesRefreshKey}
          isGitSyncing={isGitSyncing}
          gitSyncError={gitSyncError}
          pullDiverged={pullDiverged}
          branches={branches}
          currentBranch={currentBranch}
          conflictFiles={conflictFiles}
          selectedConflictFile={selectedConflictFile}
          onSelectConflictFile={setSelectedConflictFile}
          onGitSync={(action) => handleGitSync(action, () => refreshAfterGitSync(action))}
          onPullStrategy={(strategy) => handlePullStrategy(strategy, refreshAfterPullStrategy)}
          showNotification={showNotification}
          onRefresh={() => {
            loadGitSyncStatus();
            loadGitBranches();
            timeline.loadAllCommits();
            loadConflictFiles();
            workspace.loadWorkspaceFiles();
            workspace.setGitChangesRefreshKey((key) => key + 1);
          }}
          onConflictResolved={() => {
            setSelectedConflictFile(null);
            loadConflictFiles();
            workspace.loadWorkspaceFiles();
            loadGitSyncStatus();
          }}
        />
      )}

      {activeTab === "diagnostics" && (
        <DiagnosticsView
          diagData={diagnostics.diagData}
          isDiagLoading={diagnostics.isDiagLoading}
          isActionLoading={diagnostics.isActionLoading}
          lastCommandExit={diagnostics.lastCommandExit}
          diagnosticLogs={diagnostics.diagnosticLogs}
          runnerStatus={runner.runnerStatus}
          runnerLogs={runner.runnerLogs}
          terminalScrollRef={diagnostics.terminalScrollRef}
          onMaintenanceAction={diagnostics.handleMaintenanceAction}
          onTerminalScroll={diagnostics.handleTerminalScroll}
        />
      )}

      {activeTab === "timeline" && (
        <TimelineView
          allCommits={timeline.allCommits}
          isTimelineLoading={timeline.isTimelineLoading}
          selectedCalendarDate={timeline.selectedCalendarDate}
          setSelectedCalendarDate={timeline.setSelectedCalendarDate}
          calendarYear={timeline.calendarYear}
          setCalendarYear={timeline.setCalendarYear}
          calendarMonth={timeline.calendarMonth}
          setCalendarMonth={timeline.setCalendarMonth}
          isYearlyCalendarExpanded={timeline.isYearlyCalendarExpanded}
          setIsYearlyCalendarExpanded={timeline.setIsYearlyCalendarExpanded}
          contributionDays={timeline.contributionDays}
          commitCountsByDate={timeline.commitCountsByDate}
          totalCommitsLastYear={timeline.totalCommitsLastYear}
          monthLabels={timeline.monthLabels}
          repoStartYear={timeline.repoStartYear}
          currentYear={timeline.currentYear}
          formatLocalDate={timeline.formatLocalDate}
          handleSquareClick={timeline.handleSquareClick}
          getContributionColor={timeline.getContributionColor}
        />
      )}

      {activeTab === "settings" && (
        <div
          id="tour-settings-panel"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SettingsPageView
            mode="embedded"
            onActiveProfileUpdated={(updatedProfile) => {
              const commandChanged =
                updatedProfile.runCommand !== activeProfile?.runCommand ||
                updatedProfile.port !== activeProfile?.port;
              setActiveProfile(updatedProfile);
              workspace.loadWorkspaceFiles();
              loadGitBranches();
              loadGitSyncStatus();
              if (
                commandChanged &&
                (runner.runnerStatus?.status === "running" || runner.runnerStatus?.status === "starting")
              ) {
                showNotification(
                  "Run command or port changed — stop and restart the dev server to apply.",
                  "info",
                  6000
                );
              }
            }}
            onActiveProfileDeleted={() => {
              clearWorkspaceReady();
              router.push("/setup");
            }}
          />
        </div>
      )}
    </DashboardShell>
  );
}
