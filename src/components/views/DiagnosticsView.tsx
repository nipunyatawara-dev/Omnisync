"use client";

import Loader from "@/components/Loader";
import type { DiagnosticDetails } from "@/types/dashboard";
import { RunnerStatus } from "@/lib/runner";
import { terminalLineColor } from "@/lib/parseInstallLogs";

interface DiagnosticsViewProps {
  diagData: DiagnosticDetails | null;
  isDiagLoading: boolean;
  isActionLoading: boolean;
  lastCommandExit: { success: boolean } | null;
  diagnosticLogs: string[];
  runnerStatus: RunnerStatus;
  runnerLogs: string[];
  terminalScrollRef: React.RefObject<HTMLDivElement | null>;
  onMaintenanceAction: (action: string) => void;
  onTerminalScroll: () => void;
}

export default function DiagnosticsView({
  diagData,
  isDiagLoading,
  isActionLoading,
  lastCommandExit,
  diagnosticLogs,
  runnerStatus,
  runnerLogs,
  terminalScrollRef,
  onMaintenanceAction,
  onTerminalScroll,
}: DiagnosticsViewProps) {
  return (
    <div
      id="tour-diagnostics-panel"
      className="animate-fade-slide"
      style={{
        flex: 1,
        padding: "32px",
        overflowY: "auto",
        backgroundColor: "var(--color-bg-default)",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: "1000px",
        margin: "0 auto",
        width: "100%",
      }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px", margin: 0, color: "var(--color-fg-default)" }}>
            Environment Diagnostics
          </h2>
          <span style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: isDiagLoading ? "var(--color-attention-fg)" : "#3fb950",
            boxShadow: `0 0 8px ${isDiagLoading ? "var(--color-attention-fg)" : "#3fb950"}`,
          }}></span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginTop: "4px" }}>
          Verify Node version engine limits, audit local module packages, and run automated script repairs.
        </p>
      </div>

      {isDiagLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "32px", backgroundColor: "var(--color-bg-subtle)", borderRadius: "8px", border: "1px solid var(--color-border-default)" }}>
          <Loader size="sm" label="Scanning workspace" />
          <span style={{ fontSize: "13px", color: "var(--color-fg-muted)" }}>Scanning workspace directory packages and system environment variables...</span>
        </div>
      ) : diagData ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr", gap: "16px" }}>

            <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px", background: "rgba(22, 27, 34, 0.4)" }}>
              <div>
                <div style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Node.js Runtime</div>
                <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "8px", fontFamily: "var(--font-mono)" }}>{diagData.nodeVersion}</div>
              </div>
              <div style={{ marginTop: "12px" }}>
                {diagData.isNodeCompatible ? (
                  <span className="badge badge-success" style={{ fontSize: "10px", padding: "3px 8px" }}>Compatible ({diagData.enginesNode})</span>
                ) : (
                  <span className="badge badge-danger" style={{ fontSize: "10px", padding: "3px 8px" }}>Mismatch (Required: {diagData.enginesNode})</span>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px", background: "rgba(22, 27, 34, 0.4)" }}>
              <div>
                <div style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>npm Package Manager</div>
                <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "8px", fontFamily: "var(--font-mono)" }}>v{diagData.npmVersion}</div>
              </div>
              <div style={{ marginTop: "12px" }}>
                <span className="badge badge-info" style={{ fontSize: "10px", padding: "3px 8px" }}>System Installed</span>
              </div>
            </div>

            <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "130px", background: "rgba(22, 27, 34, 0.4)" }}>
              <div>
                <div style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Dependencies Check</div>
                <div style={{ fontSize: "13px", marginTop: "8px" }}>
                  Total dependencies: <strong>{diagData.totalDependencies}</strong> packages
                </div>
              </div>

              <div style={{ marginTop: "12px" }}>
                {diagData.missingDependencies.length === 0 ? (
                  <div style={{
                    fontSize: "11px",
                    color: "var(--color-success-fg)",
                    backgroundColor: "rgba(63, 185, 80, 0.05)",
                    border: "1px solid var(--color-success-border)",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    display: "inline-block",
                    fontWeight: 600,
                  }}>
                    ✓ node_modules clean
                  </div>
                ) : (
                  <div style={{
                    fontSize: "11px",
                    color: "var(--color-danger-fg)",
                    backgroundColor: "rgba(248, 81, 73, 0.05)",
                    border: "1px solid var(--color-danger-border)",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    display: "inline-block",
                    fontWeight: 600,
                  }}>
                    ⚠️ {diagData.missingDependencies.length} package folders missing
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600" }}>Diagnostics & Repair Console</span>
              {isActionLoading && <Loader size="xs" label="Running action" />}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", minHeight: "260px" }}>

              <div style={{
                padding: "20px",
                borderRight: "1px solid var(--color-border-default)",
                backgroundColor: "var(--color-bg-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}>
                <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px", marginBottom: "4px" }}>
                  Available Commands
                </div>

                <button
                  className="btn"
                  disabled={isActionLoading}
                  onClick={() => onMaintenanceAction("clean-cache")}
                  style={{ textAlign: "left", padding: "10px 14px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}
                >
                  <span style={{ fontWeight: 600 }}>Clear npm Cache</span>
                  <span style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "normal" }}>Forces cleanup of the local npm build cache</span>
                </button>

                <button
                  className="btn"
                  disabled={isActionLoading}
                  onClick={() => onMaintenanceAction("audit-fix")}
                  style={{ textAlign: "left", padding: "10px 14px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}
                >
                  <span style={{ fontWeight: 600 }}>Security Audit Fix</span>
                  <span style={{ fontSize: "10px", color: "var(--color-fg-muted)", fontWeight: "normal" }}>Audits local modules for vulnerabilities</span>
                </button>

                <button
                  className="btn btn-danger"
                  disabled={isActionLoading}
                  onClick={() => onMaintenanceAction("clean-modules")}
                  style={{ textAlign: "left", padding: "10px 14px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px", marginTop: "auto" }}
                >
                  <span style={{ fontWeight: 600 }}>Reinstall node_modules</span>
                  <span style={{ fontSize: "10px", opacity: 0.8, fontWeight: "normal" }}>Deletes and recreates the target local packages</span>
                </button>
              </div>

              <div style={{
                backgroundColor: "#05080c",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}>
                <div
                  ref={terminalScrollRef}
                  onScroll={onTerminalScroll}
                  style={{
                    flex: 1,
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    overflowY: "auto",
                    lineHeight: "20px",
                    color: "#8b949e",
                    maxHeight: "280px",
                  }}>
                  {(() => {
                    const showDiagnosticsTerminal =
                      diagnosticLogs.length > 0 || isActionLoading || lastCommandExit !== null;
                    const showRunnerTerminal =
                      !showDiagnosticsTerminal &&
                      (runnerStatus?.status === "running" || runnerStatus?.status === "starting");

                    if (showRunnerTerminal) {
                      return (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "6px", marginBottom: "10px", fontSize: "11px" }}>
                            <span style={{ color: "var(--color-fg-muted)" }}>dev_server_stream.log</span>
                            <span className="badge badge-success animate-pulse" style={{ color: "var(--color-success-fg)", borderColor: "var(--color-success-border)" }}>
                              {runnerStatus?.status === "starting" ? "Starting..." : "Running"}
                            </span>
                          </div>
                          <pre style={{
                            margin: 0,
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            whiteSpace: "pre-wrap",
                          }}>
                            <div className="mb-xs" style={{ color: "#3fb950" }}>{diagData ? `${diagData.username || "shockagg"}@${diagData.hostname || "Nipuns-MacBook-Air"} ${diagData.folderName || "OmniSync"} % npm run dev` : "shockagg@Nipuns-MacBook-Air OmniSync % npm run dev"}</div>
                            {runnerLogs.map((log, idx) => (
                              <div key={idx} style={{ color: log.includes("[ERROR]") ? "var(--color-danger-fg)" : "#3fb950" }}>{log}</div>
                            ))}
                          </pre>
                        </div>
                      );
                    }

                    return (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "6px", marginBottom: "10px", fontSize: "11px" }}>
                          <span style={{ color: "var(--color-fg-muted)" }}>terminal_stream.log</span>
                          {isActionLoading ? (
                            <span className="badge badge-warning animate-pulse" style={{ color: "var(--color-attention-fg)", borderColor: "var(--color-attention-border)" }}>Running...</span>
                          ) : lastCommandExit ? (
                            <span className={`badge ${lastCommandExit.success ? "badge-success" : "badge-danger"}`}>
                              {lastCommandExit.success ? "Exit Code: 0" : "Exit Code: 1"}
                            </span>
                          ) : null}
                        </div>
                        <pre style={{
                          margin: 0,
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          whiteSpace: "pre-wrap",
                        }}>
                          {diagnosticLogs.length === 0 && !isActionLoading ? (
                            <div style={{ color: "#8b949e" }}>
                              {diagData ? `${diagData.username || "shockagg"}@${diagData.hostname || "Nipuns-MacBook-Air"} ${diagData.folderName || "OmniSync"} %` : "shockagg@Nipuns-MacBook-Air OmniSync %"}
                            </div>
                          ) : (
                            diagnosticLogs.map((log, idx) => (
                              <div
                                key={`${idx}-${log.slice(0, 24)}`}
                                style={{ color: log === "" ? "transparent" : terminalLineColor(log) }}
                              >
                                {log || "\u00A0"}
                              </div>
                            ))
                          )}
                        </pre>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", background: "rgba(22, 27, 34, 0.2)", border: "1px solid var(--color-border-default)" }}>
            <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>Project Specifications</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--color-fg-subtle)" }}>Project Name</div>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-fg-default)", marginTop: "2px" }}>{diagData.projectName || "Unnamed Project"}</div>
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--color-fg-subtle)" }}>Version & License</div>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-fg-default)", marginTop: "2px" }}>v{diagData.projectVersion || "1.0.0"} ({diagData.projectLicense || "MIT"})</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--color-fg-subtle)" }}>Description</div>
              <div style={{ fontSize: "12px", color: "var(--color-fg-muted)", marginTop: "2px", lineHeight: "1.4" }}>{diagData.projectDescription || "No description available in package.json."}</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: "13px", color: "var(--color-fg-muted)", padding: "16px", textAlign: "center" }}>
          Environment diagnostics data unavailable.
        </div>
      )}
    </div>
  );
}
