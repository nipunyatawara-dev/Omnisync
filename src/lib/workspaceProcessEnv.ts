import { augmentProcessEnv } from "@/lib/shellEnv";

export type WorkspaceEnvMode = "development" | "production" | "inherit";

const STRIP_EXACT_KEYS = new Set([
  "NODE_ENV",
  "PORT",
  "PWD",
  "OLDPWD",
  "HOSTNAME",
  "npm_config_prefix",
  "NPM_CONFIG_PREFIX",
]);

const STRIP_PREFIXES = [
  "OMNISYNC_",
  "NEXT_",
  "__NEXT_",
  "ELECTRON_",
  "__CF",
  "__CURSOR",
];

export function shouldStripWorkspaceEnvKey(key: string): boolean {
  if (STRIP_EXACT_KEYS.has(key)) return true;
  return STRIP_PREFIXES.some((prefix) => key.startsWith(prefix));
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
  const cleaned: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || shouldStripWorkspaceEnvKey(key)) continue;
    cleaned[key] = value;
  }

  const env = augmentProcessEnv({
    ...cleaned,
    PWD: cwd,
    FORCE_COLOR: cleaned.FORCE_COLOR ?? "1",
  });

  if (options.port && options.port > 0) {
    env.PORT = String(options.port);
  }

  if (options.mode === "development") {
    env.NODE_ENV = "development";
  } else if (options.mode === "production") {
    env.NODE_ENV = "production";
  }

  return env;
}

export function workspaceEnvModeForRunCommand(runCommand: string): WorkspaceEnvMode {
  const cmd = runCommand.toLowerCase();
  const isDev =
    (/\bdev\b/.test(cmd) || cmd.includes("next dev")) && !/\bstart\b/.test(cmd);
  return isDev ? "development" : "production";
}
