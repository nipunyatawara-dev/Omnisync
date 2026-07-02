"use client";

import { useEffect, useRef, useMemo } from "react";
import {
  classifyLogLine,
  dedupeLogs,
  parseInstallSummary,
} from "@/lib/parseInstallLogs";

export type DependencyInstallPhase = "installing" | "success" | "error";

export interface DependencyInstallModalState {
  phase: DependencyInstallPhase;
  missingCount: number;
  missingPackages: string[];
  logs: string[];
  error?: string;
}

interface DependencyInstallModalProps {
  state: DependencyInstallModalState;
  onDismiss: () => void;
  onRetry: () => void;
}

function PhaseIcon({ phase }: { phase: Exclude<DependencyInstallPhase, "installing"> }) {
  if (phase === "success") {
    return (
      <div className="dep-install-icon dep-install-icon--success" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="dep-install-icon dep-install-icon--error" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function DependencyInstallModal({
  state,
  onDismiss,
  onRetry,
}: DependencyInstallModalProps) {
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const { phase, missingCount, missingPackages, logs, error } = state;

  const displayLogs = useMemo(() => dedupeLogs(logs), [logs]);
  const summary = useMemo(() => parseInstallSummary(displayLogs), [displayLogs]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayLogs, phase]);

  const subtitle =
    phase === "installing"
      ? `Resolving ${missingCount} missing package${missingCount === 1 ? "" : "s"} via npm install…`
      : phase === "success"
        ? summary.packagesAdded != null
          ? `Added ${summary.packagesAdded} packages in ${summary.durationSeconds ?? "—"}s`
          : `${missingCount} package${missingCount === 1 ? "" : "s"} resolved`
        : "npm install did not complete — review the log below";

  return (
    <div className="dep-install-backdrop" role="dialog" aria-modal="true" aria-labelledby="dep-install-title">
      <div className="dep-install-card animate-fade-slide">
        <header className="dep-install-header">
          {phase !== "installing" && <PhaseIcon phase={phase} />}
          <div className="dep-install-header-text">
            <h2 id="dep-install-title" className="dep-install-title">
              {phase === "installing" && "Installing dependencies"}
              {phase === "success" && "Workspace ready"}
              {phase === "error" && "Installation failed"}
            </h2>
            <p className="dep-install-subtitle">{subtitle}</p>
          </div>
        </header>

        <div className={`dep-install-progress dep-install-progress--${phase}`}>
          <div className="dep-install-progress-fill" />
        </div>

        {phase === "success" && (summary.packagesAdded != null || summary.vulnerabilityLine) && (
          <div className="dep-install-stats">
            {summary.packagesAdded != null && (
              <div className="dep-install-stat">
                <span className="dep-install-stat-value tabular-nums">{summary.packagesAdded}</span>
                <span className="dep-install-stat-label">packages added</span>
              </div>
            )}
            {summary.packagesAudited != null && (
              <div className="dep-install-stat">
                <span className="dep-install-stat-value tabular-nums">{summary.packagesAudited}</span>
                <span className="dep-install-stat-label">audited</span>
              </div>
            )}
            {summary.durationSeconds != null && (
              <div className="dep-install-stat">
                <span className="dep-install-stat-value tabular-nums">{summary.durationSeconds}s</span>
                <span className="dep-install-stat-label">elapsed</span>
              </div>
            )}
          </div>
        )}

        {missingPackages.length > 0 && phase === "installing" && (
          <div className="dep-install-packages">
            <span className="dep-install-packages-label">Missing</span>
            <div className="dep-install-packages-list">
              {missingPackages.slice(0, 8).map((pkg) => (
                <span key={pkg} className="dep-install-pkg-chip">
                  {pkg}
                </span>
              ))}
              {missingPackages.length > 8 && (
                <span className="dep-install-pkg-chip dep-install-pkg-chip--more">
                  +{missingPackages.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}

        <div className="dep-install-terminal">
          <div className="dep-install-terminal-chrome">
            <span className="dep-install-terminal-dot" />
            <span className="dep-install-terminal-dot" />
            <span className="dep-install-terminal-dot" />
            <span className="dep-install-terminal-label">npm install</span>
          </div>
          <div className="dep-install-terminal-body">
            {displayLogs.map((log, idx) => (
              <div
                key={`${idx}-${log.slice(0, 24)}`}
                className={`dep-install-log-line dep-install-log-line--${classifyLogLine(log)}`}
              >
                {log}
              </div>
            ))}
            {phase === "installing" && (
              <div className="dep-install-log-cursor" aria-hidden>
                ▋
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        {phase === "success" && summary.vulnerabilityLine && (
          <p className="dep-install-vuln-note">{summary.vulnerabilityLine}</p>
        )}

        {phase === "error" && error && (
          <p className="dep-install-error-banner">{error}</p>
        )}

        <footer className="dep-install-footer">
          {phase === "installing" && (
            <span className="dep-install-footer-hint">Do not close this window while install runs</span>
          )}
          <div className="dep-install-footer-actions">
            {phase === "error" && (
              <button type="button" className="btn btn-sm btn-primary" onClick={onRetry}>
                Retry install
              </button>
            )}
            {phase !== "installing" && (
              <button type="button" className="btn btn-sm btn-primary" onClick={onDismiss}>
                {phase === "success" ? "Continue to workspace" : "Dismiss"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
