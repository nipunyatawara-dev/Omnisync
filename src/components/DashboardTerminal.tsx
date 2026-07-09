"use client";

import React, { useRef } from "react";
import type { TerminalLine } from "@/lib/dashboardTerminal";

const MIN_VISIBLE = 120;

interface DashboardTerminalProps {
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
  onScroll: () => void;
  onSubmit: () => void;
  onClear: () => void;
  lineColor: (line: TerminalLine) => string;
}

export default function DashboardTerminal({
  lines,
  prompt,
  input,
  setInput,
  height,
  persistHeight,
  isCollapsed,
  toggleCollapsed,
  isManualRunning,
  isSubmitting,
  scrollRef,
  onScroll,
  onSubmit,
  onClear,
  lineColor,
}: DashboardTerminalProps) {
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault();
    resizeRef.current = { startY: event.clientY, startHeight: height };

    const onMove = (moveEvent: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startY - moveEvent.clientY;
      persistHeight(resizeRef.current.startHeight + delta);
    };

    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="dashboard-terminal"
      style={{
        height: isCollapsed ? "36px" : `${height}px`,
        flexShrink: 0,
        borderTop: "1px solid var(--color-border-default)",
        backgroundColor: "#05080c",
        display: "flex",
        flexDirection: "column",
        minHeight: isCollapsed ? "36px" : `${MIN_VISIBLE}px`,
      }}
    >
      {!isCollapsed && (
        <div
          onMouseDown={startResize}
          style={{
            height: "4px",
            cursor: "row-resize",
            backgroundColor: "transparent",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-border-default)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          height: "32px",
          borderBottom: isCollapsed ? "none" : "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          backgroundColor: "var(--color-bg-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={toggleCollapsed}
            style={{ padding: "2px 8px", fontSize: "11px", height: "24px" }}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? "Show Terminal" : "Hide Terminal"}
          </button>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-fg-muted)" }}>Terminal</span>
          {(isManualRunning || isSubmitting) && (
            <span className="badge badge-warning animate-pulse" style={{ fontSize: "9px", padding: "1px 6px" }}>
              Running
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onClear}
          style={{ padding: "2px 8px", fontSize: "11px", height: "24px" }}
        >
          Clear
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div
            ref={scrollRef}
            onScroll={onScroll}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              lineHeight: "18px",
              color: "#8b949e",
              minHeight: 0,
            }}
          >
            {lines.length === 0 ? (
              <div style={{ color: "#6e7681" }}>
                {prompt} % <span style={{ opacity: 0.7 }}>type a command and press Enter</span>
              </div>
            ) : (
              lines.map((line) => (
                <div
                  key={line.id}
                  style={{
                    color: lineColor(line),
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {line.text || "\u00A0"}
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#3fb950", whiteSpace: "nowrap" }}>
              {prompt} %
            </span>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isManualRunning || isSubmitting}
              placeholder={isManualRunning ? "Waiting for command to finish..." : "npm run build"}
              spellCheck={false}
              autoComplete="off"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--color-fg-default)",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                padding: 0,
              }}
            />
          </form>
        </>
      )}
    </div>
  );
}
