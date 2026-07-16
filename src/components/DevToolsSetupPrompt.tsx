"use client";

import { useCallback, useEffect, useState } from "react";
import type { DevToolStatus } from "@/lib/devToolsBootstrap";

type PanelMode = "collapsed" | "expanded";

const DISMISS_KEY = "omnisync_devtools_prompt_dismissed";

export default function DevToolsSetupPrompt() {
  const [tools, setTools] = useState<DevToolStatus[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PanelMode>("collapsed");
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DISMISS_KEY) === "true";
  });

  const missing = tools.filter((t) => t.required && !t.installed);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system/devtools");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not check developer tools");
        return;
      }
      setTools(data.tools || []);
      const isReady = Boolean(data.ready);
      setReady(isReady);
      if (isReady && typeof window !== "undefined") {
        localStorage.removeItem(DISMISS_KEY);
        setDismissed(false);
      }
      setError("");
    } catch {
      setError("Could not check developer tools");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => {
      if (!ready) load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load, ready]);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(DISMISS_KEY, "true");
    }
    setDismissed(true);
  };

  const runInstall = async (action: "install" | "install-all", tool?: string) => {
    setBusyTool(tool || "all");
    setError("");
    setLogs([]);
    setMode("expanded");

    try {
      const res = await fetch("/api/system/devtools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tool }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Install failed to start");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              type: string;
              message?: string;
              tools?: DevToolStatus[];
              ready?: boolean;
            };
            if (event.type === "log" && event.message) {
              setLogs((prev) => [...prev.slice(-80), event.message!]);
            } else if (event.type === "error" && event.message) {
              setError(event.message);
            } else if (event.type === "done") {
              if (event.tools) setTools(event.tools);
              if (typeof event.ready === "boolean") {
                setReady(event.ready);
                if (event.ready && typeof window !== "undefined") {
                  localStorage.removeItem(DISMISS_KEY);
                  setDismissed(false);
                }
              }
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setBusyTool(null);
    }
  };

  if (loading || ready || dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: "20px",
        bottom: "20px",
        zIndex: 1200,
        width: mode === "expanded" ? "min(420px, calc(100vw - 40px))" : "320px",
        display: "flex",
        flexDirection: "column",
        gap: "0",
        borderRadius: "12px",
        border: "1px solid var(--color-border-default)",
        backgroundColor: "var(--color-bg-default)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
        overflow: "hidden",
      }}
      role="dialog"
      aria-label="Required developer tools"
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: mode === "expanded" ? "1px solid var(--color-border-default)" : "none",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          background: "var(--color-bg-subtle)",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: "var(--color-attention-bg, rgba(210, 153, 34, 0.15))",
            color: "var(--color-attention-fg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
            construction
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-fg-default)" }}>
            Install required tools
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", marginTop: "2px", lineHeight: 1.4 }}>
            {missing.length} required tool{missing.length === 1 ? "" : "s"} missing
            {missing.length > 0 ? `: ${missing.map((t) => t.label).join(", ")}` : ""}.
            OmniSync can download and install them for you.
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setMode((m) => (m === "expanded" ? "collapsed" : "expanded"))}
            aria-label={mode === "expanded" ? "Collapse" : "Expand"}
            title={mode === "expanded" ? "Collapse" : "Expand"}
            style={{ padding: "4px 6px", minWidth: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              {mode === "expanded" ? "expand_more" : "expand_less"}
            </span>
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleDismiss}
            aria-label="Dismiss"
            title="Dismiss"
            style={{ padding: "4px 6px", minWidth: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              close
            </span>
          </button>
        </div>
      </div>

      {mode === "collapsed" ? (
        <div style={{ padding: "12px 16px", display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            onClick={() => setMode("expanded")}
          >
            Set up tools
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleDismiss}>
            Dismiss
          </button>
        </div>
      ) : (
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {tools.map((tool) => (
              <div
                key={tool.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border-default)",
                  background: "var(--color-bg-subtle)",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "18px",
                    color: tool.installed ? "var(--color-success-fg)" : "var(--color-attention-fg)",
                  }}
                >
                  {tool.installed ? "check_circle" : "radio_button_unchecked"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-fg-default)" }}>
                    {tool.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", marginTop: "2px" }}>
                    {tool.installed
                      ? tool.version || "Installed"
                      : tool.description}
                  </div>
                </div>
                {!tool.installed && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busyTool !== null}
                    onClick={() => runInstall("install", tool.id)}
                  >
                    {busyTool === tool.id ? "Installing…" : "Install"}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={busyTool !== null || missing.length === 0}
              onClick={() => runInstall("install-all")}
            >
              {busyTool === "all" ? "Installing…" : "Install all missing"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busyTool !== null}
              onClick={() => load()}
            >
              Refresh
            </button>
          </div>

          {error && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--color-danger-fg)",
                background: "var(--color-danger-bg)",
                border: "1px solid var(--color-danger-border)",
                borderRadius: "6px",
                padding: "8px 10px",
              }}
            >
              {error}
            </div>
          )}

          {logs.length > 0 && (
            <pre
              style={{
                margin: 0,
                maxHeight: "140px",
                overflowY: "auto",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                background: "#05080c",
                color: "#8b949e",
                borderRadius: "6px",
                padding: "10px",
                whiteSpace: "pre-wrap",
              }}
            >
              {logs.join("\n")}
            </pre>
          )}

          <p style={{ margin: 0, fontSize: "11px", color: "var(--color-fg-muted)", lineHeight: 1.4 }}>
            You can dismiss this anytime. If tools are already installed, tap Refresh — OmniSync checks
            Homebrew and common install paths directly.
          </p>
        </div>
      )}
    </div>
  );
}
