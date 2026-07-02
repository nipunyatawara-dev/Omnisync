const { execSync, spawn } = require("child_process");
const os = require("os");

let cachedLoginPath = null;
const commandCache = new Map();

function getLoginShell() {
  return process.env.SHELL || "/bin/zsh";
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
    cachedLoginPath = execSync(`${shell} -ilc 'echo -n $PATH'`, {
      encoding: "utf8",
      timeout: 8000,
      env: baseSpawnEnv(),
    }).trim();
    if (!cachedLoginPath) cachedLoginPath = fallback;
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
    }).trim();
    const line = output.split("\n").filter(Boolean).pop();
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
