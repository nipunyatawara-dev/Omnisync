import type { AccentColor, GlobalSettings } from "@/lib/globalSettingsTypes";
import { DEFAULT_GLOBAL_SETTINGS } from "@/lib/globalSettingsTypes";

export function syncGlobalSettingsToLocalStorage(settings: GlobalSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem("omnisync_global_git_username", settings.gitUsername || "");
  localStorage.setItem("omnisync_global_git_email", settings.gitEmail || "");
  localStorage.setItem("omnisync_global_default_branch", settings.defaultBranch || "main");
  localStorage.setItem("omnisync_global_auto_fetch_interval", settings.autoFetchInterval || "5");
  localStorage.setItem("omnisync_global_terminal_shell", settings.terminalShell || "zsh");
  localStorage.setItem("omnisync_global_show_hidden", String(!!settings.showHiddenFiles));
  localStorage.setItem("omnisync_global_accent", settings.accentColor || "default");
}

export function readGlobalSettingsFromLocalStorage(): GlobalSettings {
  if (typeof window === "undefined") return { ...DEFAULT_GLOBAL_SETTINGS };

  return {
    gitUsername: localStorage.getItem("omnisync_global_git_username") || "",
    gitEmail: localStorage.getItem("omnisync_global_git_email") || "",
    defaultBranch: localStorage.getItem("omnisync_global_default_branch") || "main",
    autoFetchInterval: localStorage.getItem("omnisync_global_auto_fetch_interval") || "5",
    terminalShell: localStorage.getItem("omnisync_global_terminal_shell") || "zsh",
    showHiddenFiles: localStorage.getItem("omnisync_global_show_hidden") !== "false",
    accentColor: (localStorage.getItem("omnisync_global_accent") || "default") as AccentColor,
  };
}
