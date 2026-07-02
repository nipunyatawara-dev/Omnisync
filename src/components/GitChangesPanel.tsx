"use client";

import { useState, useEffect, useCallback } from "react";
import type { GitWorkingFile, MergeState } from "@/lib/git";

interface GitChangesPanelProps {
  branchProtected: boolean;
  refreshKey?: number;
  onCommitted?: () => void;
}

export default function GitChangesPanel({ branchProtected, refreshKey = 0, onCommitted }: GitChangesPanelProps) {
  const [files, setFiles] = useState<GitWorkingFile[]>([]);
  const [mergeState, setMergeState] = useState<MergeState>("none");
  const [commitMessage, setCommitMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkingStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/git?action=working-status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load changes");
      setFiles(data.files || []);
      setMergeState(data.mergeState || "none");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load changes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void loadWorkingStatus();
  }, [loadWorkingStatus, refreshKey]);

  const toggleStage = async (file: GitWorkingFile) => {
    setError(null);
    const action = file.staged ? "unstage" : "stage";
    try {
      const res = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, files: [file.path] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action}`);
      setFiles(data.files || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      setError("Commit message is required");
      return;
    }
    setIsCommitting(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", message: commitMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Commit failed");
      setCommitMessage("");
      await loadWorkingStatus();
      onCommitted?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleMergeContinue = async () => {
    setIsContinuing(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge-continue" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to continue merge/rebase");
      await loadWorkingStatus();
      onCommitted?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to continue");
    } finally {
      setIsContinuing(false);
    }
  };

  const stagedCount = files.filter((f) => f.staged).length;
  const unstagedCount = files.filter((f) => !f.staged).length;
  const hasConflicts = files.some((f) => f.status === "conflicted");

  if (isLoading) {
    return (
      <div style={{ padding: "12px", fontSize: "12px", color: "var(--color-fg-muted)" }}>
        Loading changes...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px" }}>
          Changes
        </span>
        <span className="badge" style={{ fontSize: "10px" }}>
          {files.length === 0
            ? "clean"
            : stagedCount > 0 && unstagedCount > 0
              ? `${stagedCount} staged, ${unstagedCount} unstaged`
              : stagedCount > 0
                ? `${stagedCount} staged`
                : `${unstagedCount} unstaged`}
        </span>
      </div>

      {mergeState !== "none" && !hasConflicts && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={isContinuing}
          onClick={handleMergeContinue}
          style={{ width: "100%", fontSize: "11px" }}
        >
          {isContinuing
            ? "..."
            : mergeState === "rebase"
              ? "Continue Rebase"
              : "Complete Merge"}
        </button>
      )}

      {files.length === 0 ? (
        <div style={{
          padding: "12px",
          borderRadius: "6px",
          fontSize: "11px",
          color: "var(--color-fg-muted)",
          border: "1px solid var(--color-border-default)",
          backgroundColor: "rgba(22, 27, 34, 0.4)",
        }}>
          Working tree clean — no uncommitted changes.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "180px", overflowY: "auto" }}>
          {files.map((file) => (
            <div
              key={file.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                border: "1px solid var(--color-border-default)",
                backgroundColor: file.staged ? "var(--color-accent-bg)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={file.staged}
                onChange={() => toggleStage(file)}
                style={{ width: "14px", height: "14px", flexShrink: 0 }}
              />
              <span
                style={{
                  flex: 1,
                  fontFamily: "var(--font-mono)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: file.status === "conflicted" ? "var(--color-danger-fg)" : "inherit",
                }}
                title={file.path}
              >
                {file.path}
              </span>
              <span style={{ fontSize: "9px", color: "var(--color-fg-muted)", textTransform: "uppercase" }}>
                {file.status}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <textarea
          className="form-control"
          placeholder="Commit message"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          rows={3}
          disabled={branchProtected || isCommitting}
          style={{ fontSize: "12px", resize: "vertical", minHeight: "60px" }}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={branchProtected || isCommitting || stagedCount === 0}
          onClick={handleCommit}
          style={{ fontSize: "11px", opacity: branchProtected ? 0.5 : 1 }}
          title={branchProtected ? "Commits to protected branches are disabled" : undefined}
        >
          {isCommitting ? "Committing..." : `Commit (${stagedCount})`}
        </button>
      </div>

      {error && (
        <div style={{
          fontSize: "11px",
          color: "var(--color-danger-fg)",
          backgroundColor: "var(--color-danger-bg)",
          border: "1px solid var(--color-danger-border)",
          borderRadius: "4px",
          padding: "6px 8px",
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
