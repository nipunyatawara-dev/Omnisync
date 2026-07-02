"use client";

import { useState, useEffect } from "react";
import { ConflictBlock } from "@/lib/git";
import Tooltip from "@/components/Tooltip";
import Loader from "@/components/Loader";

interface ConflictResolverProps {
  relativeFile: string;
  onResolved: () => void;
}

export default function ConflictResolver({ relativeFile, onResolved }: ConflictResolverProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [conflictBlocks, setConflictBlocks] = useState<ConflictBlock[]>([]);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, "ours" | "theirs" | "both" | "pending">>({});
  const [manualOutput, setManualOutput] = useState("");
  const [error, setError] = useState("");

  // Load conflict details
  useEffect(() => {
    async function loadConflicts() {
      setIsLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/workspace/git?action=conflict-details&file=${encodeURIComponent(relativeFile)}`);
        const data = await res.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        const blocks: ConflictBlock[] = data.blocks || [];
        const lines: string[] = data.rawLines || [];

        setConflictBlocks(blocks);
        setRawLines(lines);
        
        const initialRes: Record<string, "ours" | "theirs" | "both" | "pending"> = {};
        blocks.forEach((block: ConflictBlock) => {
          initialRes[block.id] = "pending";
        });
        setResolutions(initialRes);

        // Set initial manual output code
        let output = "";
        lines.forEach((line) => {
          if (line.startsWith("##CONFLICT_BLOCK:") && line.endsWith("##")) {
            const blockId = line.replace("##CONFLICT_BLOCK:", "").replace("##", "");
            const block = blocks.find((b) => b.id === blockId);
            if (block) {
              output += block.original + "\n";
            }
          } else {
            output += line + "\n";
          }
        });
        setManualOutput(output.trim());

      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load conflict files.");
      } finally {
        setIsLoading(false);
      }
    }
    loadConflicts();
  }, [relativeFile]);

  // Recalculate output content based on current selections
  const recalculateOutput = (
    currentResolutions: Record<string, "ours" | "theirs" | "both" | "pending">,
    blocksList: ConflictBlock[],
    rawLinesList: string[]
  ) => {
    let output = "";
    rawLinesList.forEach((line) => {
      if (line.startsWith("##CONFLICT_BLOCK:") && line.endsWith("##")) {
        const blockId = line.replace("##CONFLICT_BLOCK:", "").replace("##", "");
        const block = blocksList.find((b) => b.id === blockId);
        const resolution = currentResolutions[blockId];

        if (block) {
          if (resolution === "ours") {
            output += block.ours + "\n";
          } else if (resolution === "theirs") {
            output += block.theirs + "\n";
          } else if (resolution === "both") {
            output += block.ours + "\n" + block.theirs + "\n";
          } else {
            output += block.original + "\n";
          }
        }
      } else {
        output += line + "\n";
      }
    });

    setManualOutput(output.trim());
  };

  const handleResolveBlock = (blockId: string, choice: "ours" | "theirs" | "both") => {
    setResolutions((prev) => {
      const next = {
        ...prev,
        [blockId]: choice,
      };
      // Recalculate code output immediately when change occurs
      recalculateOutput(next, conflictBlocks, rawLines);
      return next;
    });
  };

  const handleSaveResolution = async () => {
    const pendingBlocks = Object.values(resolutions).filter((r) => r === "pending");
    if (pendingBlocks.length > 0) {
      if (!confirm("Some conflicts are not resolved yet (retaining git markers). Save anyway?")) {
        return;
      }
    }

    try {
      const res = await fetch("/api/workspace/file-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: relativeFile,
          content: manualOutput,
        }),
      });

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }

      // Stage resolved file in git index
      await fetch("/api/workspace/git", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stage-file", file: relativeFile }),
      });

      alert("Conflicts resolved, saved, and staged successfully.");
      onResolved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Error saving: ${msg}`);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Loader size="md" label="Loading conflict" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flash flash-danger" style={{ margin: "24px" }}>
        {error}
      </div>
    );
  }

  const conflictsLeft = Object.values(resolutions).filter((r) => r === "pending").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header bar */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--color-border-default)",
        backgroundColor: "var(--color-bg-subtle)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-fg-default)" }}>Merge Conflict Editor</span>
            <span style={{ color: "var(--color-fg-muted)", fontSize: "12px" }}>/</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--color-accent-fg)", fontWeight: 600 }}>{relativeFile.split("/").pop()}</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
            {conflictsLeft === 0 ? (
              <>
                <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#3fb950" }}></span>
                <span style={{ color: "#3fb950", fontWeight: 600 }}>All conflicts resolved</span>
              </>
            ) : (
              <>
                <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-danger-fg)" }}></span>
                <span>{conflictsLeft} merge conflicts remaining</span>
              </>
            )}
          </div>
        </div>
        <Tooltip content="Apply and write conflict resolutions back to workspace file" position="left">
          <button className="btn btn-primary btn-sm" onClick={handleSaveResolution} style={{ padding: "6px 14px" }}>
            Save Resolution
          </button>
        </Tooltip>
      </div>

      {/* 3-Pane conflict layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Pane 1: Current Ours Change */}
        <div style={{
          flex: 1,
          borderRight: "1px solid var(--color-border-default)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--color-border-default)",
            backgroundColor: "rgba(56, 139, 253, 0.08)",
            color: "var(--color-accent-fg)",
            fontWeight: 600,
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <span style={{ fontSize: "12px" }}>←</span>
            <span>Current Change (Ours / Local)</span>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "16px", backgroundColor: "rgba(56, 139, 253, 0.01)" }}>
            {conflictBlocks.map((block) => (
              <div key={block.id} style={{ marginBottom: "16px", border: "1px solid var(--color-border-default)", borderRadius: "6px", overflow: "hidden", background: "rgba(22, 27, 34, 0.4)" }}>
                <div style={{ padding: "6px 10px", backgroundColor: "var(--color-bg-subtle)", fontSize: "11px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border-default)" }}>
                  <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>Block {block.id}</span>
                  <Tooltip content="Choose current local code revision" position="bottom">
                    <button className="btn btn-sm" style={{ padding: "2px 8px", fontSize: "10px" }} onClick={() => handleResolveBlock(block.id, "ours")}>
                      Accept Ours
                    </button>
                  </Tooltip>
                </div>
                <pre style={{ margin: 0, padding: "12px", fontFamily: "var(--font-mono)", fontSize: "11px", whiteSpace: "pre-wrap", overflowX: "auto", color: "#e6edf3", lineHeight: "16px" }}>
                  {block.ours || <span style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}>[Empty block]</span>}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* Pane 2: Resulting Code (Editable) */}
        <div style={{
          flex: 1.4,
          borderRight: "1px solid var(--color-border-default)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--color-border-default)",
            backgroundColor: "var(--color-bg-subtle)",
            fontWeight: 600,
            fontSize: "12px",
            color: "var(--color-fg-default)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <span>✏️</span>
            <span>Resulting Output (Live Editable)</span>
          </div>
          <textarea
            value={manualOutput}
            onChange={(e) => setManualOutput(e.target.value)}
            style={{
              flex: 1,
              padding: "20px",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              lineHeight: "22px",
              backgroundColor: "#05080c",
              color: "#e6edf3",
              border: "none",
              resize: "none",
              outline: "none",
            }}
          />
        </div>

        {/* Pane 3: Incoming Theirs Change */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--color-border-default)",
            backgroundColor: "rgba(46, 160, 67, 0.08)",
            color: "#3fb950",
            fontWeight: 600,
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <span>→</span>
            <span>Incoming Change (Theirs / Remote)</span>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "16px", backgroundColor: "rgba(46, 160, 67, 0.01)" }}>
            {conflictBlocks.map((block) => (
              <div key={block.id} style={{ marginBottom: "16px", border: "1px solid var(--color-border-default)", borderRadius: "6px", overflow: "hidden", background: "rgba(22, 27, 34, 0.4)" }}>
                <div style={{ padding: "6px 10px", backgroundColor: "var(--color-bg-subtle)", fontSize: "11px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border-default)" }}>
                  <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>Block {block.id}</span>
                  <Tooltip content="Choose incoming remote code revision" position="bottom">
                    <button className="btn btn-sm" style={{ padding: "2px 8px", fontSize: "10px" }} onClick={() => handleResolveBlock(block.id, "theirs")}>
                      Accept Theirs
                    </button>
                  </Tooltip>
                </div>
                <pre style={{ margin: 0, padding: "12px", fontFamily: "var(--font-mono)", fontSize: "11px", whiteSpace: "pre-wrap", overflowX: "auto", color: "#e6edf3", lineHeight: "16px" }}>
                  {block.theirs || <span style={{ color: "var(--color-fg-subtle)", fontStyle: "italic" }}>[Empty block]</span>}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
