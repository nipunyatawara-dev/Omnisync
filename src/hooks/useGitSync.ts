"use client";

import { useState, useCallback } from "react";
import type { MergeState } from "@/lib/git";

export interface SyncStatus {
  ahead: number;
  behind: number;
  upstream: string;
}

type GitSyncAction = "fetch" | "pull" | "push" | "pull-merge" | "pull-rebase";

export function useGitSync(showNotification: (msg: string, type?: "info" | "success" | "error", duration?: number) => void) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ ahead: 0, behind: 0, upstream: "" });
  const [branchProtected, setBranchProtected] = useState(false);
  const [autoFetchIntervalMinutes, setAutoFetchIntervalMinutes] = useState(0);
  const [isGitSyncing, setIsGitSyncing] = useState<GitSyncAction | null>(null);
  const [gitSyncError, setGitSyncError] = useState<string | null>(null);
  const [pullDiverged, setPullDiverged] = useState(false);
  const [mergeState, setMergeState] = useState<MergeState>("none");
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [selectedConflictFile, setSelectedConflictFile] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState("main");

  const loadGitSyncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/git?action=status");
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error || "Failed to load sync status", "error");
        return;
      }
      setSyncStatus((data.sync as SyncStatus) || { ahead: 0, behind: 0, upstream: "" });
      if (typeof data.branchProtected === "boolean") setBranchProtected(data.branchProtected);
      if (typeof data.autoFetchIntervalMinutes === "number") {
        setAutoFetchIntervalMinutes(data.autoFetchIntervalMinutes);
      }
      if (data.mergeState) setMergeState(data.mergeState as MergeState);
    } catch {
      showNotification("Failed to load sync status", "error");
    }
  }, [showNotification]);

  const loadGitBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/git?action=branches");
      const data = await res.json();
      if (data.branches) setBranches(data.branches);
      if (data.current) setCurrentBranch(data.current);
    } catch {}
  }, []);

  const loadConflictFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/git?action=conflicts");
      const data = await res.json();
      setConflictFiles((data.conflicts as string[]) || []);
    } catch {}
  }, []);

  const handleGitSync = useCallback(
    async (action: "fetch" | "pull" | "push", onSuccess?: () => void) => {
      setIsGitSyncing(action);
      setGitSyncError(null);
      setPullDiverged(false);
      try {
        const res = await fetch("/api/workspace/git", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (action === "pull" && res.status === 409 && data.code === "PULL_NOT_FAST_FORWARD") {
            setPullDiverged(true);
            setGitSyncError(data.hint || data.error);
            return;
          }
          const message = data.error || `Git ${action} failed`;
          setGitSyncError(message);
          showNotification(message, "error");
          return;
        }
        if (data.sync) setSyncStatus(data.sync as SyncStatus);
        else await loadGitSyncStatus();
        if (data.mergeState) setMergeState(data.mergeState as MergeState);
        await loadConflictFiles();
        onSuccess?.();
        showNotification(`Git ${action} completed successfully`, "success", 2500);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setGitSyncError(msg);
        showNotification(msg, "error");
      } finally {
        setIsGitSyncing(null);
      }
    },
    [loadGitSyncStatus, loadConflictFiles, showNotification]
  );

  const handlePullStrategy = useCallback(
    async (strategy: "pull-merge" | "pull-rebase", onSuccess?: () => void) => {
      setIsGitSyncing(strategy);
      setGitSyncError(null);
      try {
        const res = await fetch("/api/workspace/git", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: strategy }),
        });
        const data = await res.json();
        if (!res.ok) {
          const message = data.error || `Git ${strategy} failed`;
          setGitSyncError(message);
          showNotification(message, "error");
          return;
        }
        setPullDiverged(false);
        if (data.sync) setSyncStatus(data.sync as SyncStatus);
        else await loadGitSyncStatus();
        if (data.mergeState) setMergeState(data.mergeState as MergeState);
        await loadConflictFiles();
        onSuccess?.();
        showNotification(
          `Git pull (${strategy === "pull-merge" ? "merge" : "rebase"}) completed`,
          "success",
          2500
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setGitSyncError(msg);
        showNotification(msg, "error");
      } finally {
        setIsGitSyncing(null);
      }
    },
    [loadGitSyncStatus, loadConflictFiles, showNotification]
  );

  return {
    syncStatus,
    branchProtected,
    autoFetchIntervalMinutes,
    isGitSyncing,
    gitSyncError,
    pullDiverged,
    mergeState,
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
  };
}
