"use client";

import { useEffect, useState, type ReactNode } from "react";
import ConflictResolver from "@/components/ConflictResolver";
import GitChangesPanel from "@/components/GitChangesPanel";
import BranchFilterMultiSelect from "@/components/BranchFilterMultiSelect";
import BranchMergePanel from "@/components/BranchMergePanel";
import CollaborationFeed from "@/components/CollaborationFeed";
import type { SyncStatus } from "@/hooks/useGitSync";
import { useCollaborationFeed } from "@/hooks/useCollaborationFeed";
import type { UserProfile } from "@/lib/profiles";

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          gap: "8px",
          padding: 0,
          marginBottom: open ? "12px" : 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "inherit",
          textAlign: "left",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            color: "var(--color-fg-muted)",
            letterSpacing: "0.5px",
          }}
        >
          {title}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{
            color: "var(--color-fg-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open ? children : null}
    </div>
  );
}

interface GitSyncViewProps {
  activeProfile: UserProfile | null;
  syncStatus: SyncStatus;
  branchProtected: boolean;
  changesRefreshKey?: number;
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
  showNotification: (msg: string, type?: "info" | "success" | "error", duration?: number) => void;
  feedRefreshKey?: number;
}

export default function GitSyncView({
  activeProfile,
  syncStatus,
  branchProtected,
  changesRefreshKey = 0,
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
  showNotification,
  feedRefreshKey = 0,
}: GitSyncViewProps) {
  const feed = useCollaborationFeed(branches);
  const [syncOpen, setSyncOpen] = useState(true);
  const [mergeOpen, setMergeOpen] = useState(true);

  useEffect(() => {
    if (feedRefreshKey > 0) feed.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedRefreshKey]);

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
        <CollapsibleSection title="Repository Sync" open={syncOpen} onToggle={() => setSyncOpen((v) => !v)}>
          <div
            id="tour-git-sync"
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
        </CollapsibleSection>

        <div id="tour-git-changes">
          <GitChangesPanel
            branchProtected={branchProtected}
            refreshKey={changesRefreshKey}
            onCommitted={onRefresh}
          />
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

        <div id="tour-git-conflicts">
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

      <div
        style={{
          flex: 1,
          overflow: "hidden",
          backgroundColor: "var(--color-bg-default)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {selectedConflictFile ? (
          <ConflictResolver relativeFile={selectedConflictFile} onResolved={onConflictResolved} />
        ) : (
          <>
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--color-border-default)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                flexShrink: 0,
                backgroundColor: "var(--color-bg-subtle)",
              }}
            >
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px" }}>Collaboration</h2>
                <p style={{ fontSize: "12px", color: "var(--color-fg-muted)", margin: 0 }}>
                  Commit activity across selected branches
                  {activeProfile?.workspacePath
                    ? ` · ${activeProfile.workspacePath.split("/").pop()}`
                    : ""}
                  {currentBranch ? ` · on ${currentBranch}` : ""}
                </p>
              </div>
              <BranchFilterMultiSelect
                branches={branches}
                selected={feed.selectedBranches}
                onChange={feed.setSelectedBranches}
              />
              <CollapsibleSection title="Merge branches" open={mergeOpen} onToggle={() => setMergeOpen((v) => !v)}>
                <BranchMergePanel
                  branches={branches}
                  currentBranch={currentBranch}
                  branchProtected={branchProtected}
                  showNotification={showNotification}
                  onConflictSelect={(file) => onSelectConflictFile(file)}
                  onMerged={() => {
                    onRefresh();
                    feed.reload();
                  }}
                />
              </CollapsibleSection>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <CollaborationFeed
                commits={feed.commits}
                avatars={feed.avatars}
                isLoading={feed.isLoading}
                sessionAvatarUrl={feed.sessionAvatarUrl}
                sessionEmail={feed.sessionEmail || activeProfile?.email}
                sessionLogin={feed.sessionLogin}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
