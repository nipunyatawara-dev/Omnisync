"use client";

import { useState, useEffect, useRef } from "react";
import { GitCommit, DiffLine } from "@/lib/git";

interface DiffViewerProps {
  selectedFile: string | null;
}

export default function DiffViewer({ selectedFile }: DiffViewerProps) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  const lastFetchedDiffRef = useRef<string | null>(null);

  // Collapse & Resizing states
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false);
  const [isDiffCollapsed, setIsDiffCollapsed] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(250);
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Handle vertical timeline height resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingTimeline && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const relativeY = e.clientY - rect.top;
        const newHeight = Math.max(80, Math.min(rect.height - 80, relativeY));
        setTimelineHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizingTimeline(false);
    };

    if (isResizingTimeline) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingTimeline]);

  const startResizeTimeline = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingTimeline(true);
  };

  // Load commit history for selected file
  useEffect(() => {
    if (!selectedFile) {
      Promise.resolve().then(() => {
        setCommits([]);
        setSelectedCommit(null);
        setDiffLines([]);
      });
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      if (active) setIsLoadingHistory(true);
    }, 150); // Debounce: only set loading to true if load takes > 150ms

    async function loadHistory() {
      try {
        const historyRes = await fetch(`/api/workspace/git?action=commits&file=${encodeURIComponent(selectedFile!)}`);
        const historyData = await historyRes.json();
        const newCommits = historyData.commits || [];
        
        let newCommitHash = null;
        let newDiffLines = [];

        if (newCommits.length > 0) {
          newCommitHash = newCommits[0].hash;
          // Fetch the diff for this first commit immediately
          const diffRes = await fetch(`/api/workspace/git?action=diff&commit=${newCommitHash}&file=${encodeURIComponent(selectedFile!)}`);
          const diffData = await diffRes.json();
          newDiffLines = diffData.diff || [];
        }

        if (active) {
          setCommits(newCommits);
          setSelectedCommit(newCommitHash);
          setDiffLines(newDiffLines);
          if (newCommitHash) {
            lastFetchedDiffRef.current = `${selectedFile}-${newCommitHash}`;
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        clearTimeout(timer);
        if (active) {
          setIsLoadingHistory(false);
          setIsLoadingDiff(false);
        }
      }
    }
    loadHistory();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedFile]);

  // Load diff for selected commit
  useEffect(() => {
    if (!selectedCommit || !selectedFile) {
      Promise.resolve().then(() => {
        setDiffLines([]);
      });
      return;
    }

    // Skip duplicate network requests
    if (lastFetchedDiffRef.current === `${selectedFile}-${selectedCommit}`) {
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      if (active) setIsLoadingDiff(true);
    }, 150); // Debounce: only set loading to true if load takes > 150ms

    async function loadDiff() {
      try {
        const res = await fetch(`/api/workspace/git?action=diff&commit=${selectedCommit}&file=${encodeURIComponent(selectedFile!)}`);
        const data = await res.json();
        if (active) {
          setDiffLines(data.diff || []);
          lastFetchedDiffRef.current = `${selectedFile}-${selectedCommit}`;
        }
      } catch (e) {
        console.error(e);
      } finally {
        clearTimeout(timer);
        if (active) {
          setIsLoadingDiff(false);
        }
      }
    }
    loadDiff();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedCommit, selectedFile]);

  if (!selectedFile) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--color-fg-muted)",
        fontSize: "13px",
        padding: "16px",
        textAlign: "center",
      }}>
        Select a file to inspect its Git history.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Commit History Timeline (Top Half) */}
      <div style={{
        height: isTimelineCollapsed ? "42px" : isDiffCollapsed ? "auto" : `${timelineHeight}px`,
        flex: isDiffCollapsed ? 1 : "none",
        overflowY: isTimelineCollapsed ? "hidden" : "auto",
        borderBottom: isTimelineCollapsed ? "1px solid var(--color-border-default)" : "none",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        transition: "height 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexShrink: 0 }}>
          <h3 style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "var(--color-fg-muted)", margin: 0 }}>
            Commit Timeline
          </h3>
          <button
            onClick={() => setIsTimelineCollapsed(!isTimelineCollapsed)}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-fg-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              borderRadius: "4px",
              transition: "background-color 0.1s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-bg-active)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            title={isTimelineCollapsed ? "Expand" : "Collapse"}
          >
            <span style={{
              display: "inline-block",
              transform: isTimelineCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
              fontSize: "10px",
              lineHeight: 1,
            }}>
              ▼
            </span>
          </button>
        </div>
        
        {!isTimelineCollapsed && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {isLoadingHistory ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}>
                <div className="spinner"></div>
              </div>
            ) : commits.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", padding: "8px" }}>
                No commit history found for this file.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", opacity: isLoadingHistory ? 0.6 : 1, transition: "opacity 0.15s ease-in-out" }}>
                {commits.map((commit) => (
                  <div
                    key={commit.hash}
                    onClick={() => setSelectedCommit(commit.hash)}
                    style={{
                      padding: "8px",
                      borderRadius: "6px",
                      border: `1px solid ${selectedCommit === commit.hash ? "var(--color-accent-border)" : "var(--color-border-default)"}`,
                      backgroundColor: selectedCommit === commit.hash ? "var(--color-accent-bg)" : "var(--color-bg-subtle)",
                      cursor: "pointer",
                      fontSize: "12px",
                      transition: "all 0.1s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600, color: "var(--color-fg-default)" }}>
                        {commit.subject}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--color-fg-muted)" }}>
                        {commit.hash.slice(0, 7)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--color-fg-muted)" }}>
                      <span>{commit.author}</span>
                      <span>{new Date(commit.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resizer horizontal bar */}
      {!isTimelineCollapsed && !isDiffCollapsed && (
        <div
          onMouseDown={startResizeTimeline}
          style={{
            height: "4px",
            cursor: "row-resize",
            backgroundColor: isResizingTimeline ? "var(--color-accent-fg)" : "transparent",
            borderTop: "1px solid var(--color-border-default)",
            borderBottom: "1px solid var(--color-border-default)",
            transition: "background-color 0.15s",
            zIndex: 10,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!isResizingTimeline) e.currentTarget.style.backgroundColor = "var(--color-border-default)";
          }}
          onMouseLeave={(e) => {
            if (!isResizingTimeline) e.currentTarget.style.backgroundColor = "transparent";
          }}
        />
      )}

      {/* Diff Analyzer (Bottom Half) */}
      <div style={{
        flex: isTimelineCollapsed ? 1 : isDiffCollapsed ? "none" : 1,
        height: isDiffCollapsed ? "42px" : "auto",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        borderTop: isTimelineCollapsed ? "none" : "1px solid var(--color-border-default)",
        transition: "height 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{
          padding: "8px 12px",
          backgroundColor: "var(--color-bg-subtle)",
          borderBottom: "1px solid var(--color-border-default)",
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--color-fg-muted)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
          height: "42px",
        }}>
          <span>Line Diff Analyzer</span>
          <button
            onClick={() => setIsDiffCollapsed(!isDiffCollapsed)}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-fg-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              borderRadius: "4px",
              transition: "background-color 0.1s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-bg-active)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            title={isDiffCollapsed ? "Expand" : "Collapse"}
          >
            <span style={{
              display: "inline-block",
              transform: isDiffCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
              fontSize: "10px",
              lineHeight: 1,
            }}>
              ▼
            </span>
          </button>
        </div>

        {!isDiffCollapsed && (
          <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
            {isLoadingDiff ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "16px" }}>
                <div className="spinner"></div>
              </div>
            ) : !selectedCommit ? (
              <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", padding: "12px", textAlign: "center" }}>
                Select a commit above to inspect changes.
              </div>
            ) : diffLines.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", padding: "12px", textAlign: "center" }}>
                No modifications shown in this commit.
              </div>
            ) : (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", lineHeight: "18px", whiteSpace: "pre-wrap", opacity: isLoadingDiff ? 0.6 : 1, transition: "opacity 0.15s ease-in-out" }}>
                {diffLines.map((line, idx) => {
                  let bgColor = "transparent";
                  let textColor = "var(--color-fg-default)";
                  let prefix = " ";

                  if (line.type === "added") {
                    bgColor = "var(--color-diff-added-bg)";
                    textColor = "var(--color-success-fg)";
                    prefix = "+";
                  } else if (line.type === "removed") {
                    bgColor = "var(--color-diff-removed-bg)";
                    textColor = "var(--color-danger-fg)";
                    prefix = "-";
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: bgColor,
                        color: textColor,
                        padding: "0 8px",
                        display: "flex",
                        gap: "8px",
                        borderLeft: line.type === "added" ? "3px solid var(--color-diff-added-line)" : line.type === "removed" ? "3px solid var(--color-diff-removed-line)" : "3px solid transparent",
                      }}
                    >
                      <span style={{ userSelect: "none", color: "var(--color-fg-subtle)", width: "12px" }}>{prefix}</span>
                      <span>{line.content || " "}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
