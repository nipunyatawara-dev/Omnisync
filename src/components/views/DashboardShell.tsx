"use client";

import Loader from "@/components/Loader";
import Tooltip from "@/components/Tooltip";
import DashboardTerminal from "@/components/DashboardTerminal";
import DependencyInstallModal, {
  type DependencyInstallModalState,
} from "@/components/DependencyInstallModal";
import type { UserProfile } from "@/lib/profiles";
import type { DashboardTab } from "@/types/dashboard";
import type { ToastType } from "@/hooks/useNotifications";
import type { TerminalLine } from "@/lib/dashboardTerminal";

interface DashboardTerminalBindings {
  lines: TerminalLine[];
  prompt: string;
  input: string;
  setInput: (value: string) => void;
  height: number;
  persistHeight: (value: number) => void;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  isManualRunning: boolean;
  isSubmitting: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  submitCommand: () => void;
  clearTerminal: () => void;
  lineColor: (line: TerminalLine) => string;
}

interface DashboardShellProps {
  activeProfile: UserProfile | null;
  branchProtected: boolean;
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  toast: { message: string; type: ToastType } | null;
  dismissToast: () => void;
  depInstallModal: DependencyInstallModalState | null;
  onDismissDepInstall: () => void;
  onRetryDepInstall: (missingPackages: string[]) => void;
  showGuideTourButton: boolean;
  onOpenTour: () => void;
  onDismissTourButton: () => void;
  onSwitchWorkspace: () => void;
  terminal: DashboardTerminalBindings;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function DashboardShell({
  activeProfile,
  branchProtected,
  activeTab,
  setActiveTab,
  toast,
  dismissToast,
  depInstallModal,
  onDismissDepInstall,
  onRetryDepInstall,
  showGuideTourButton,
  onOpenTour,
  onDismissTourButton,
  onSwitchWorkspace,
  terminal,
  children,
  footer,
}: DashboardShellProps) {
  return (
    <div className="app-container">
      {depInstallModal && (
        <DependencyInstallModal
          state={depInstallModal}
          onDismiss={onDismissDepInstall}
          onRetry={() => onRetryDepInstall(depInstallModal.missingPackages)}
        />
      )}

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
              <Loader size="xs" className="shrink-0" label="Processing" />
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
                  onClick={onOpenTour}
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
                  onClick={onDismissTourButton}
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
            <button className="btn btn-sm" onClick={onSwitchWorkspace}>
              Switch Workspace
            </button>
          </Tooltip>
        </div>
      </header>

      <div className="main-layout">
        <nav className="sidebar" id="tour-sidebar" role="tablist" aria-label="Dashboard sections">
          <Tooltip content="Workspace Editor & Server" position="right">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "workspace"}
              aria-controls="dashboard-panel-workspace"
              aria-label="Workspace"
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
              type="button"
              role="tab"
              aria-selected={activeTab === "git"}
              aria-controls="dashboard-panel-git"
              aria-label="Git Sync"
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
              type="button"
              role="tab"
              aria-selected={activeTab === "diagnostics"}
              aria-controls="dashboard-panel-diagnostics"
              aria-label="Diagnostics"
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
              type="button"
              role="tab"
              aria-selected={activeTab === "timeline"}
              aria-controls="dashboard-panel-timeline"
              aria-label="Timeline"
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

          <Tooltip content="Settings" position="right">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "settings"}
              aria-controls="dashboard-panel-settings"
              aria-label="Settings"
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

        <main className="content-pane">
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {children}
          </div>
          <DashboardTerminal
            lines={terminal.lines}
            prompt={terminal.prompt}
            input={terminal.input}
            setInput={terminal.setInput}
            height={terminal.height}
            persistHeight={terminal.persistHeight}
            isCollapsed={terminal.isCollapsed}
            toggleCollapsed={terminal.toggleCollapsed}
            isManualRunning={terminal.isManualRunning}
            isSubmitting={terminal.isSubmitting}
            scrollRef={terminal.scrollRef}
            onScroll={terminal.handleScroll}
            onSubmit={terminal.submitCommand}
            onClear={terminal.clearTerminal}
            lineColor={terminal.lineColor}
          />
        </main>
      </div>

      {footer}
    </div>
  );
}
