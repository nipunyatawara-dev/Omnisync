"use client";

import { useEffect, useState } from "react";

interface BranchMergePanelProps {
  branches: string[];
  currentBranch: string;
  branchProtected: boolean;
  onConflictSelect?: (file: string) => void;
  onMerged: () => void;
  showNotification: (msg: string, type?: "info" | "success" | "error", duration?: number) => void;
}

export default function BranchMergePanel({
  branches,
  currentBranch,
  branchProtected,
  onConflictSelect,
  onMerged,
  showNotification,
}: BranchMergePanelProps) {
  const [target, setTarget] = useState(currentBranch || branches[0] || "");
  const [source, setSource] = useState(() => branches.find((b) => b !== currentBranch) || "");
  const [previewing, setPreviewing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [previewClean, setPreviewClean] = useState<boolean | null>(null);
  const [previewConflicts, setPreviewConflicts] = useState<string[]>([]);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [checkedPair, setCheckedPair] = useState<string | null>(null);

  useEffect(() => {
    setTarget((prev) => (branches.includes(prev) ? prev : currentBranch || branches[0] || ""));
    setSource((prev) => {
      if (branches.includes(prev) && prev !== target) return prev;
      return branches.find((b) => b !== (currentBranch || branches[0])) || "";
    });
    // Reset preview when branch list changes
    setPreviewClean(null);
    setPreviewConflicts([]);
    setCheckedPair(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when branches/current change
  }, [branches, currentBranch]);

  useEffect(() => {
    setPreviewClean(null);
    setPreviewConflicts([]);
    setPreviewMessage(null);
    setCheckedPair(null);
  }, [source, target]);

  const pairKey = `${source}→${target}`;
  const canMerge =
    !!source &&
    !!target &&
    source !== target &&
    checkedPair === pairKey &&
    previewClean === true &&
    !merging;

  const handleCheck = async () => {
    if (!source || !target || source === target) {
      showNotification("Select two different branches", "error");
      return;
    }
    setPreviewing(true);
    setPreviewMessage(null);
    try {
      const res = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge-preview", source, target }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error || "Conflict check failed", "error");
        setPreviewClean(null);
        setCheckedPair(null);
        return;
      }
      setPreviewClean(!!data.clean);
      setPreviewConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);
      setPreviewMessage(typeof data.message === "string" ? data.message : null);
      setCheckedPair(pairKey);
      if (data.clean) {
        showNotification("No conflicts — safe to merge", "success", 2500);
      } else if ((data.conflicts || []).length > 0) {
        showNotification(`${data.conflicts.length} file(s) would conflict`, "error", 3500);
      }
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : "Conflict check failed", "error");
    } finally {
      setPreviewing(false);
    }
  };

  const handleMerge = async () => {
    if (!canMerge) return;
    if (branchProtected && target === currentBranch) {
      // Protection is for the target branch name specifically — API also enforces.
    }
    setMerging(true);
    try {
      const res = await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge-branches", source, target }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error || "Merge failed", "error");
        return;
      }
      if (data.status === "ok") {
        showNotification(`Merged ${source} → ${target}`, "success", 3000);
        setPreviewClean(null);
        setCheckedPair(null);
        onMerged();
        return;
      }
      if (data.status === "conflicts") {
        showNotification(data.message || "Merge has conflicts", "error", 4000);
        const conflicts = (data.conflicts as string[]) || [];
        setPreviewConflicts(conflicts);
        setPreviewClean(false);
        onMerged();
        if (conflicts[0]) onConflictSelect?.(conflicts[0]);
        return;
      }
      showNotification(data.message || "Merge failed", "error");
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : "Merge failed", "error");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        background: "rgba(22, 27, 34, 0.35)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 140px" }}>
          <span style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>Into (target)</span>
          <select
            className="form-control"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              padding: "6px 32px 6px 8px",
              borderRadius: "6px",
              border: "1px solid var(--color-border-default)",
              backgroundColor: "var(--color-bg-default)",
              color: "var(--color-fg-default)",
              width: "100%",
            }}
          >
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <span style={{ fontSize: "12px", color: "var(--color-fg-muted)", paddingBottom: "8px" }}>←</span>

        <label style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 140px" }}>
          <span style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>From (source)</span>
          <select
            className="form-control"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              padding: "6px 32px 6px 8px",
              borderRadius: "6px",
              border: "1px solid var(--color-border-default)",
              backgroundColor: "var(--color-bg-default)",
              color: "var(--color-fg-default)",
              width: "100%",
            }}
          >
            {branches.map((b) => (
              <option key={b} value={b} disabled={b === target}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn-sm"
          disabled={previewing || !source || !target || source === target}
          onClick={handleCheck}
          style={{ fontSize: "11px", fontWeight: 600 }}
        >
          {previewing ? "Checking…" : "Check conflicts"}
        </button>

        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!canMerge}
          onClick={handleMerge}
          style={{ fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-mono)" }}
          title={
            checkedPair !== pairKey
              ? "Check conflicts first"
              : previewClean === false
                ? "Resolve predicted conflicts or pick another pair"
                : undefined
          }
        >
          {merging ? "…" : `${source || "…"} → ${target || "…"}`}
        </button>
      </div>

      {previewMessage && (
        <div style={{ fontSize: "12px", color: "var(--color-danger-fg)" }}>{previewMessage}</div>
      )}

      {checkedPair === pairKey && previewClean === true && (
        <div
          style={{
            fontSize: "12px",
            color: "var(--color-success-fg)",
            backgroundColor: "rgba(63, 185, 80, 0.08)",
            border: "1px solid var(--color-success-border)",
            borderRadius: "6px",
            padding: "8px 10px",
          }}
        >
          No conflicts — safe to merge <strong>{source}</strong> into <strong>{target}</strong>.
        </div>
      )}

      {checkedPair === pairKey && previewClean === false && previewConflicts.length > 0 && (
        <div
          style={{
            fontSize: "12px",
            color: "var(--color-danger-fg)",
            backgroundColor: "var(--color-danger-bg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "6px",
            padding: "8px 10px",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "6px" }}>
            {previewConflicts.length} file(s) would conflict
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            {previewConflicts.slice(0, 12).map((file) => (
              <li key={file} style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                {file}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: "8px", color: "var(--color-fg-muted)", fontSize: "11px" }}>
            You can still start the merge to resolve conflicts in the resolver, or change branches.
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: "8px", fontSize: "11px" }}
            disabled={merging}
            onClick={async () => {
              // Allow merge even with predicted conflicts so user can resolve in-app
              setMerging(true);
              try {
                const res = await fetch("/api/workspace/git", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "merge-branches", source, target }),
                });
                const data = await res.json();
                if (!res.ok) {
                  showNotification(data.error || "Merge failed", "error");
                  return;
                }
                onMerged();
                const conflicts = (data.conflicts as string[]) || previewConflicts;
                if (conflicts[0]) onConflictSelect?.(conflicts[0]);
                showNotification(
                  data.status === "conflicts"
                    ? "Merge started — resolve conflicts"
                    : data.message || "Merge finished",
                  data.status === "ok" ? "success" : "info",
                  3500
                );
              } catch (e: unknown) {
                showNotification(e instanceof Error ? e.message : "Merge failed", "error");
              } finally {
                setMerging(false);
              }
            }}
          >
            Start merge anyway
          </button>
        </div>
      )}
    </div>
  );
}
