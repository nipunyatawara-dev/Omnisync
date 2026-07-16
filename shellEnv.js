const { execFileSync, spawn } = require("child_process");
const os = require("os");

let cachedLoginPath = null;
const commandCache = new Map();

/** Only these tool names may be resolved via the login shell. */
const ALLOWED_RESOLVE_COMMANDS = new Set(["git", "npm", "node", "npx", "yarn", "pnpm", "gh", "brew"]);

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

/**
 * Last-line scrub before spawn. shellEnv.js is loaded via createRequire (not
 * webpack-bundled), so this always sees real runtime keys — including
 * __NEXT_PRIVATE_STANDALONE_CONFIG that OmniSync's standalone server.js sets.
 * Intentionally set NODE_ENV / PORT / PWD / INIT_CWD from callers are kept.
 */
const WORKSPACE_POISON_EXACT = new Set([
  "HOSTNAME",
  "TURBOPACK",
  "TURBO",
  "VERCEL",
  "KEEP_ALIVE_TIMEOUT",
  "EDITOR",
  "OLDPWD",
]);

const WORKSPACE_POISON_PREFIXES = [
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

function isWorkspacePoisonKey(key) {
  if (WORKSPACE_POISON_EXACT.has(key) || WORKSPACE_POISON_EXACT.has(key.toLowerCase())) {
    return true;
  }
  const lower = key.toLowerCase();
  return WORKSPACE_POISON_PREFIXES.some(
    (prefix) => key.startsWith(prefix) || lower.startsWith(prefix.toLowerCase())
  );
}

function scrubSpawnEnv(env) {
  const out = { ...env };
  for (const key of Object.keys(out)) {
    if (isWorkspacePoisonKey(key)) delete out[key];
  }
  delete out.npm_config_prefix;
  delete out.NPM_CONFIG_PREFIX;
  return out;
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
function getOmniSyncToolsBin() {
  const userData = process.env.OMNISYNC_USER_DATA_DIR;
  if (!userData) return null;
  return pathJoin(userData, "tools", "bin");
}

function augmentProcessEnv(base = process.env) {
  const loginPath = getLoginShellPath();
  const toolsBin = getOmniSyncToolsBin();
  return {
    ...baseSpawnEnv(base),
    PATH: toolsBin ? `${toolsBin}:${loginPath}` : loginPath,
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
    const lookupScript = `command -v ${name}`;
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
function resolveSpawnEnv(options = {}) {
  // Prefer an explicit env object (including empty). Never silently fall back
  // when the caller passed env — that re-leaked OmniSync PORT/NODE_ENV.
  const explicit = options.env !== undefined;
  const base = explicit ? options.env : process.env;
  const env = scrubSpawnEnv(augmentProcessEnv(base));
  if (!explicit) {
    // Raw process.env fallback: drop host Next/Electron process identity.
    delete env.NODE_ENV;
    delete env.PORT;
    delete env.HOSTNAME;
    delete env.PWD;
    delete env.INIT_CWD;
    delete env.OLDPWD;
  }
  return env;
}

function spawnLoginCommand(commandLine, options = {}) {
  const shell = getLoginShell();
  const cwd = options.cwd;
  const wrapped =
    cwd && typeof cwd === "string" && cwd.length > 0
      ? `cd ${shellQuote(cwd)} && ${commandLine}`
      : commandLine;
  return spawn(shell, ["-ilc", wrapped], {
    cwd: cwd || undefined,
    env: resolveSpawnEnv(options),
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
      env: resolveSpawnEnv(options),
    });
  }

  const resolved = resolveCommand(name);
  return spawn(resolved, args, {
    cwd: options.cwd,
    env: resolveSpawnEnv(options),
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
