export type AccentColor = "default" | "emerald" | "royal" | "sunset";

export interface GlobalSettings {
  gitUsername: string;
  gitEmail: string;
  defaultBranch: string;
  /** Minutes between background fetches; "0" = manual only */
  autoFetchInterval: string;
  terminalShell: string;
  showHiddenFiles: boolean;
  enableTelemetry: boolean;
  accentColor: AccentColor;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  gitUsername: "",
  gitEmail: "",
  defaultBranch: "main",
  autoFetchInterval: "5",
  terminalShell: "zsh",
  showHiddenFiles: true,
  enableTelemetry: true,
  accentColor: "default",
};

/** Resolved fetch interval in ms; 0 when disabled */
export function autoFetchIntervalMs(
  profileAutoFetch: boolean | undefined,
  intervalMinutes: string
): number {
  if (!profileAutoFetch) return 0;
  const minutes = parseInt(intervalMinutes, 10);
  if (!minutes || minutes <= 0) return 0;
  return minutes * 60 * 1000;
}
