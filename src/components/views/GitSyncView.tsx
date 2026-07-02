"use client";

import ConflictResolver from "@/components/ConflictResolver";
import GitChangesPanel from "@/components/GitChangesPanel";
import type { SyncStatus } from "@/hooks/useGitSync";
import type { UserProfile } from "@/lib/profiles";

interface GitSyncViewProps {
  activeProfile: UserProfile | null;
  syncStatus: SyncStatus;
  branchProtected: boolean;
  isGitSyncing: "fetch" | "pull" | "push" | "pull-merge" | "pull-rebase" | null;
  gitSyncError: string | null;
  pullDiverged: boolean;
  branches: string[];
  currentBranch: string;
  conflictFiles: string[];
  selectedConflictFile: string | null;
  onSelectConflictFile: (file: string | null) => void;
  onGitSync: (action: "fetch" | "pull" | "push") => void;
  onPullStrategy: (strategy: "pull-merge" | "pull-rebase") => void;
  onRefresh: () => void;
  onConflictResolved: () => void;
}

export default function GitSyncView({
  activeProfile,
  syncStatus,
  branchProtected,
  isGitSyncing,
  gitSyncError,
  pullDiverged,
  branches,
  currentBranch,
  conflictFiles,
  selectedConflictFile,
  onSelectConflictFile,
  onGitSync,
  onPullStrategy,
  onRefresh,
  onConflictResolved,
}: GitSyncViewProps) {
  return (
    <div className="animate-fade-slide" style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          width: "320px",
          borderRight: "1px solid var(--color-border-default)",
          backgroundColor: "var(--color-bg-subtle)",
          padding: "24px 20px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          flexShrink: 0,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "11px",
              fontWeight: "700",
              textTransform: "uppercase",
              color: "var(--color-fg-muted)",
              letterSpacing: "0.5px",
              marginBottom: "12px",
            }}
          >
            Repository Sync
          </h3>

          <div
            className="card"
            style={{
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              background: "rgba(22, 27, 34, 0.4)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "12px",
              }}
            >
              <span style={{ color: "var(--color-fg-muted)" }}>Upstream</span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--color-accent-fg)",
                }}
              >
                {syncStatus.upstream ? syncStatus.upstream.split("/").pop() : "origin/main"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                <span style={{ fontSize: "11px", fontWeight: 600 }}>Local</span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--color-fg-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {currentBranch}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", flex: 2 }}>
                <div style={{ height: "2px", backgroundColor: "var(--color-border-default)", flex: 1 }} />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-bg-overlay)",
                    border: "1px solid var(--color-border-default)",
                    fontSize: "10px",
                  }}
                >
                  ⇄
                </div>
                <div style={{ height: "2px", backgroundColor: "var(--color-border-default)", flex: 1 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                <span style={{ fontSize: "11px", fontWeight: 600 }}>Upstream</span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--color-fg-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  origin
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "var(--color-fg-muted)" }}>Ahead (Unpushed)</span>
                <span
                  className={`badge ${syncStatus.ahead > 0 ? "badge-warning" : ""}`}
                  style={{ fontSize: "11px" }}
                >
                  {syncStatus.ahead} commits
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "var(--color-fg-muted)" }}>Behind (Unsynced)</span>
                <span
                  className={`badge ${syncStatus.behind > 0 ? "badge-danger" : ""}`}
                  style={{ fontSize: "11px" }}
                >
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
                  onClick={() => onGitSync(action)}
                  style={{
                    flex: 1,
                    textTransform: "capitalize",
                    fontSize: "11px",
                    fontWeight: 600,
                    opacity: action === "push" && branchProtected ? 0.5 : 1,
                  }}
                  title={
                    action === "push" && branchProtected
                      ? "Push to protected branch is disabled"
                      : undefined
                  }
                >
                  {isGitSyncing === action ? "..." : action}
                </button>
              ))}
            </div>

            {gitSyncError && (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-danger-fg)",
                  backgroundColor: "var(--color-danger-bg)",
                  border: "1px solid var(--color-danger-border)",
                  borderRadius: "4px",
                  padding: "6px 8px",
                  lineHeight: "1.4",
                }}
              >
                {gitSyncError}
              </div>
            )}

            {pullDiverged && (
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={!!isGitSyncing}
                  onClick={() => onPullStrategy("pull-merge")}
                  style={{ flex: 1, fontSize: "10px" }}
                >
                  {isGitSyncing === "pull-merge" ? "..." : "Pull (merge)"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!!isGitSyncing}
                  onClick={() => onPullStrategy("pull-rebase")}
                  style={{ flex: 1, fontSize: "10px" }}
                >
                  {isGitSyncing === "pull-rebase" ? "..." : "Pull (rebase)"}
                </button>
              </div>
            )}
          </div>
        </div>

        <GitChangesPanel branchProtected={branchProtected} onCommitted={onRefresh} />

        <div>
          <h3
            style={{
              fontSize: "11px",
              fontWeight: "700",
              textTransform: "uppercase",
              color: "var(--color-fg-muted)",
              letterSpacing: "0.5px",
              marginBottom: "12px",
            }}
          >
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
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ color: isActive ? "var(--color-accent-fg)" : "var(--color-fg-muted)" }}
                    >
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                    <span>{b}</span>
                  </div>
                  {isActive && (
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: "#3fb950",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3
            style={{
              fontSize: "11px",
              fontWeight: "700",
              textTransform: "uppercase",
              color: "var(--color-fg-muted)",
              letterSpacing: "0.5px",
              marginBottom: "12px",
            }}
          >
            Conflict Files
          </h3>
          {conflictFiles.length === 0 ? (
            <div
              style={{
                padding: "16px",
                borderRadius: "8px",
                backgroundColor: "rgba(63, 185, 80, 0.05)",
                color: "var(--color-success-fg)",
                border: "1px solid var(--color-success-border)",
                fontSize: "12px",
              }}
            >
              <div style={{ fontWeight: 600 }}>✓ No Conflicts</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {conflictFiles.map((file) => (
                <div
                  key={file}
                  onClick={() => onSelectConflictFile(file)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    border: `1px solid ${selectedConflictFile === file ? "var(--color-danger-border)" : "var(--color-border-default)"}`,
                    backgroundColor:
                      selectedConflictFile === file ? "var(--color-danger-bg)" : "rgba(248, 81, 73, 0.02)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{file.split("/").pop()}</div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--color-fg-muted)",
                      fontFamily: "var(--font-mono)",
                      wordBreak: "break-all",
                    }}
                  >
                    {file}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", backgroundColor: "var(--color-bg-default)" }}>
        {selectedConflictFile ? (
          <ConflictResolver
            relativeFile={selectedConflictFile}
            onResolved={onConflictResolved}
          />
        ) : (
          <div
            style={{
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
            }}
          >
            <h2 style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>Git Collaboration Workspace</h2>
            <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", lineHeight: "20px" }}>
              Manage branch sync and resolve merge conflicts. Select a conflict file from the sidebar to open the
              resolver.
            </p>
            <div className="card" style={{ width: "100%", padding: "16px 20px", textAlign: "left" }}>
              <div style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>Workspace</div>
              <div
                style={{
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeProfile?.workspacePath || "No path linked"}
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", marginTop: "12px" }}>Branch</div>
              <div style={{ fontWeight: 600 }}>{currentBranch}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
