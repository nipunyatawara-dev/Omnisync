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

/** Remove consecutive duplicate lines from npm output. */
export function dedupeLogs(logs: string[]): string[] {
  return logs.filter((line, i) => i === 0 || line !== logs[i - 1]);
}
