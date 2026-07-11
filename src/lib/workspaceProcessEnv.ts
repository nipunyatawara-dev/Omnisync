import { augmentProcessEnv } from "@/lib/shellEnv";

export type WorkspaceEnvMode = "development" | "production" | "inherit";

const STRIP_EXACT_KEYS = new Set([
  "NODE_ENV",
  "PORT",
  "PWD",
  "OLDPWD",
  "HOSTNAME",
  "INIT_CWD",
  "npm_config_prefix",
  "NPM_CONFIG_PREFIX",
  "npm_config_devdir",
  "NPM_CONFIG_DEVDIR",
  "npm_config_cache",
  "NPM_CONFIG_CACHE",
  "EDITOR",
]);

const STRIP_PREFIXES = [
  "OMNISYNC_",
  "NEXT_",
  "__NEXT_",
  "ELECTRON_",
  "__CF",
  "__CURSOR",
  "CURSOR_",
  "TURBO_",
  "TURBOPACK_",
  "VERCEL_",
  "npm_config_",
  "NPM_CONFIG_",
  "npm_package_",
  "npm_lifecycle_",
  "npm_node_",
  "BUN_",
  "VSCODE_",
];

export function shouldStripWorkspaceEnvKey(key: string): boolean {
  if (STRIP_EXACT_KEYS.has(key)) return true;
  const lower = key.toLowerCase();
  if (STRIP_EXACT_KEYS.has(lower)) return true;
  return STRIP_PREFIXES.some(
    (prefix) => key.startsWith(prefix) || lower.startsWith(prefix.toLowerCase())
  );
}

/**
 * Build an isolated environment for workspace child processes.
 * OmniSync's own Next/Electron server runs with NODE_ENV=production and
 * Next-internal variables that break `next dev` / Turbopack when inherited.
 */
export function buildWorkspaceChildEnv(
  cwd: string,
  options: { port?: number; mode?: WorkspaceEnvMode } = {}
): NodeJS.ProcessEnv {
  const cleaned: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || shouldStripWorkspaceEnvKey(key)) continue;
    cleaned[key] = value;
  }

  const base: Record<string, string | undefined> = {
    ...cleaned,
    PWD: cwd,
    INIT_CWD: cwd,
    FORCE_COLOR: cleaned.FORCE_COLOR ?? "1",
  };

  if (options.port && options.port > 0) {
    base.PORT = String(options.port);
  }

  if (options.mode === "development") {
    base.NODE_ENV = "development";
  } else if (options.mode === "production") {
    base.NODE_ENV = "production";
  }

  return augmentProcessEnv(base);
}

export function workspaceEnvModeForRunCommand(runCommand: string): WorkspaceEnvMode {
  const cmd = runCommand.toLowerCase();
  const isDev =
    (/\bdev\b/.test(cmd) || cmd.includes("next dev")) && !/\bstart\b/.test(cmd);
  return isDev ? "development" : "production";
}
