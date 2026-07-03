const { execSync, spawn } = require("child_process");
const os = require("os");

let cachedLoginPath = null;
const commandCache = new Map();

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
    const raw = execSync(`${shell} -ilc 'echo -n $PATH'`, {
      encoding: "utf8",
      timeout: 8000,
      env: baseSpawnEnv(),
    });
    const cleaned = stripTerminalEscapeSequences(raw).trim();
    // A real PATH is a colon-separated list of absolute paths; anything else means
    // shell startup noise (banners, integration scripts) survived the cleanup.
    cachedLoginPath = cleaned && cleaned.split(":").every((part) => part.startsWith("/"))
      ? cleaned
      : fallback;
  } catch {
    cachedLoginPath = fallback;
  }
  return cachedLoginPath;
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

function augmentProcessEnv(base = process.env) {
  return {
    ...baseSpawnEnv(base),
    PATH: getLoginShellPath(),
  };
}

function resolveCommand(name) {
  if (process.platform === "win32") return name;
  if (commandCache.has(name)) return commandCache.get(name);

  let resolved = name;
  try {
    const shell = getLoginShell();
    const output = execSync(`${shell} -ilc 'command -v ${name}'`, {
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
      // Guard against any leftover startup noise glued onto the real path: only
      // trust a line that actually looks like an absolute path ending in the tool name.
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
 * Run a command the same way Terminal does — through the user's login shell.
 * Required for nvm/fnm/volta and for GUI apps with a minimal PATH.
 */
function spawnLoginCommand(commandLine, options = {}) {
  const shell = getLoginShell();
  return spawn(shell, ["-ilc", commandLine], {
    cwd: options.cwd,
    env: augmentProcessEnv(options.env),
  });
}

function spawnTool(name, args, options = {}) {
  if (process.platform === "win32") {
    const cmd = name.endsWith(".cmd") ? name : `${name}.cmd`;
    return spawn(cmd, args, {
      cwd: options.cwd,
      shell: true,
      env: augmentProcessEnv(options.env),
    });
  }

  const resolved = resolveCommand(name);
  const commandLine = [resolved, ...args].map((part) => shellQuote(part)).join(" ");
  return spawnLoginCommand(commandLine, options);
}

module.exports = {
  getLoginShellPath,
  augmentProcessEnv,
  resolveCommand,
  spawnLoginCommand,
  spawnTool,
};
