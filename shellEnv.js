const { execFileSync, spawn } = require("child_process");
const os = require("os");

let cachedLoginPath = null;
const commandCache = new Map();

/** Only these tool names may be resolved via the login shell. */
const ALLOWED_RESOLVE_COMMANDS = new Set(["git", "npm", "node", "npx", "yarn", "pnpm"]);

function getLoginShell() {
  return process.env.SHELL || "/bin/zsh";
}

/**
 * Interactive login shells (`-ilc`) source ~/.zshrc, which on many machines includes
 * a terminal shell-integration snippet (iTerm2/VS Code/Cursor) that unconditionally
 * writes OSC escape sequences (e.g. "\x1b]1337;CurrentDir=...\x07") to stdout on
 * startup — even though no real terminal is attached. Without a trailing newline
 * before the real output, that junk gets concatenated onto whatever we're trying to
 * capture (a PATH value or a resolved binary path), corrupting it. Strip it out.
 */
function stripTerminalEscapeSequences(str) {
  return str
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/[\x1b\x9b]/g, "");
}

function pathJoin(...parts) {
  return parts.join("/");
}

function baseSpawnEnv(base = process.env) {
  const env = { ...base, HOME: os.homedir(), USER: os.userInfo().username };
  delete env.npm_config_prefix;
  delete env.NPM_CONFIG_PREFIX;
  return env;
}

function getLoginShellPath() {
  if (cachedLoginPath) return cachedLoginPath;

  if (process.platform === "win32") {
    cachedLoginPath = process.env.PATH || process.env.Path || "";
    return cachedLoginPath;
  }

  const fallback = [
    pathJoin(os.homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");

  try {
    const shell = getLoginShell();
    const raw = execFileSync(shell, ["-ilc", "echo -n $PATH"], {
      encoding: "utf8",
      timeout: 8000,
      env: baseSpawnEnv(),
    });
    const cleaned = stripTerminalEscapeSequences(raw).trim();
    cachedLoginPath =
      cleaned && cleaned.split(":").every((part) => part.startsWith("/"))
        ? cleaned
        : fallback;
  } catch {
    cachedLoginPath = fallback;
  }
  return cachedLoginPath;
}

/**
 * Merge login PATH onto the provided env. Never re-inject a previously cached
 * full process.env — that re-polluted stripped workspace child envs (TURBO_*,
 * NEXT_*, etc.) and broke `next dev` / Turbopack.
 */
function augmentProcessEnv(base = process.env) {
  return {
    ...baseSpawnEnv(base),
    PATH: getLoginShellPath(),
  };
}

function clearShellEnvCache() {
  cachedLoginPath = null;
  commandCache.clear();
}

function resolveCommand(name) {
  if (process.platform === "win32") return name;
  if (!ALLOWED_RESOLVE_COMMANDS.has(name)) {
    throw new Error(`Refusing to resolve untrusted command name: ${name}`);
  }
  if (commandCache.has(name)) return commandCache.get(name);

  let resolved = name;
  try {
    const shell = getLoginShell();
    const lookupScript =
      name === "git"
        ? "command -v git"
        : name === "npm"
          ? "command -v npm"
          : name === "node"
            ? "command -v node"
            : name === "npx"
              ? "command -v npx"
              : name === "yarn"
                ? "command -v yarn"
                : "command -v pnpm";
    const output = execFileSync(shell, ["-ilc", lookupScript], {
      encoding: "utf8",
      timeout: 8000,
      env: augmentProcessEnv(),
    });
    const cleaned = stripTerminalEscapeSequences(output).trim();
    const line = cleaned
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean)
      .reverse()
      .find((part) => part.startsWith("/") && part.endsWith(name));
    if (line) resolved = line;
  } catch {}

  commandCache.set(name, resolved);
  return resolved;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

/**
 * Run a command through the user's login shell (nvm/fnm/volta PATH).
 * Always `cd` into cwd inside the shell so profile scripts cannot leave the
 * process in the wrong directory.
 */
function spawnLoginCommand(commandLine, options = {}) {
  const shell = getLoginShell();
  const cwd = options.cwd;
  const wrapped =
    cwd && typeof cwd === "string" && cwd.length > 0
      ? `cd ${shellQuote(cwd)} && ${commandLine}`
      : commandLine;
  return spawn(shell, ["-ilc", wrapped], {
    cwd: cwd || undefined,
    env: augmentProcessEnv(options.env || process.env),
  });
}

/**
 * Spawn a known tool by absolute path when possible — no login-shell wrapper.
 * Env must already be prepared (e.g. buildWorkspaceChildEnv); we only ensure PATH.
 */
function spawnTool(name, args, options = {}) {
  if (process.platform === "win32") {
    const cmd = name.endsWith(".cmd") ? name : `${name}.cmd`;
    return spawn(cmd, args, {
      cwd: options.cwd,
      shell: true,
      env: augmentProcessEnv(options.env || process.env),
    });
  }

  const resolved = resolveCommand(name);
  return spawn(resolved, args, {
    cwd: options.cwd,
    env: augmentProcessEnv(options.env || process.env),
  });
}

module.exports = {
  getLoginShellPath,
  augmentProcessEnv,
  resolveCommand,
  spawnLoginCommand,
  spawnTool,
  clearShellEnvCache,
  ALLOWED_RESOLVE_COMMANDS,
};
