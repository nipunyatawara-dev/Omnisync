export interface InstallSummary {
  packagesAdded?: number;
  packagesAudited?: number;
  durationSeconds?: number;
  vulnerabilityLine?: string;
}

export function parseInstallSummary(logs: string[]): InstallSummary {
  const summary: InstallSummary = {};
  for (const log of logs) {
    const addedMatch = log.match(/added (\d+) packages?, and audited (\d+) packages? in (\d+)s/);
    if (addedMatch) {
      summary.packagesAdded = parseInt(addedMatch[1], 10);
      summary.packagesAudited = parseInt(addedMatch[2], 10);
      summary.durationSeconds = parseInt(addedMatch[3], 10);
    }
    if (/vulnerabilit/i.test(log)) {
      summary.vulnerabilityLine = log.trim();
    }
  }
  return summary;
}

export type LogLineTone = "error" | "success" | "warn" | "muted" | "default";

export function classifyLogLine(line: string): LogLineTone {
  if (line.startsWith("Error:") || /npm ERR/i.test(line)) return "error";
  if (
    /successfully/i.test(line) ||
    /Command completed/i.test(line) ||
    /^added \d+ packages?/.test(line)
  ) {
    return "success";
  }
  if (/vulnerabilit/i.test(line) || /warn/i.test(line)) return "warn";
  if (/looking for funding|npm fund|Detected \d+ missing/i.test(line)) return "muted";
  return "default";
}

export function terminalLineColor(line: string): string {
  const tone = classifyLogLine(line);
  if (tone === "error") return "var(--color-danger-fg)";
  if (tone === "warn") return "var(--color-attention-fg)";
  if (tone === "muted") return "#6e7681";
  if (line.startsWith("> ") && line.includes("%")) return "#8b949e";
  return "#3fb950";
}

/** Remove consecutive duplicate lines from npm output. */
export function dedupeLogs(logs: string[]): string[] {
  return logs.filter((line, i) => i === 0 || line !== logs[i - 1]);
}
