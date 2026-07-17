import { execFile, spawn } from "child_process";
import { promises as fs } from "fs";
import { homedir, tmpdir } from "os";
import path from "path";
import { getUserDataDir } from "@/lib/userDataDir";
import { augmentProcessEnv, clearShellEnvCache, spawnTool } from "@/lib/shellEnv";

function stripShellNoise(text: string): string {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/[\x1b\x9b]/g, "")
    .replace(/^\]\d+;[^\n]*$/gm, "");
}

export type DevToolId = "node" | "git" | "gh";

export interface DevToolStatus {
  id: DevToolId;
  label: string;
  description: string;
  required: boolean;
  installed: boolean;
  version: string | null;
  path: string | null;
}

export type DevToolsLogFn = (message: string) => void;

const TOOL_META: Record<
  DevToolId,
  { label: string; description: string; required: boolean; versionArgs: string[] }
> = {
  node: {
    label: "Node.js",
    description: "Required to run JavaScript projects and npm scripts.",
    required: true,
    versionArgs: ["--version"],
  },
  git: {
    label: "Git",
    description: "Required to clone, commit, and sync repositories.",
    required: true,
    versionArgs: ["--version"],
  },
  gh: {
    label: "GitHub CLI",
    description: "Helps OmniSync talk to GitHub from the desktop app.",
    required: true,
    versionArgs: ["--version"],
  },
};

function toolsRoot(): string {
  return path.join(getUserDataDir(), "tools");
}

export function toolsBinDir(): string {
  return path.join(toolsRoot(), "bin");
}

function runCapture(cmd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { encoding: "utf-8", timeout: 12000, env: augmentProcessEnv() },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stripShellNoise(stdout || "").trim(),
          stderr: stripShellNoise(stderr || "").trim(),
        });
      }
    );
  });
}

async function pathIsRunnable(filePath: string): Promise<boolean> {
  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

/** Windows PATHEXT-style names to try for a bare tool id. */
export function windowsToolNames(name: string): string[] {
  if (/\.(exe|cmd|bat)$/i.test(name)) return [name];
  // Prefer .exe (spawn without shell) over .cmd shims.
  return [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name];
}

/**
 * Well-known locations GUI/Electron apps often miss when PATH is incomplete.
 * Pure helper so Windows/macOS candidates can be unit-tested.
 */
export function candidatePathsFor(
  name: string,
  opts: {
    platform?: NodeJS.Platform;
    home?: string;
    toolsBin?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): string[] {
  const platform = opts.platform ?? process.platform;
  const home = opts.home ?? homedir();
  const toolsBin = opts.toolsBin ?? toolsBinDir();
  const env = opts.env ?? process.env;
  const out: string[] = [];

  const push = (p: string | undefined | null) => {
    if (p && !out.includes(p)) out.push(p);
  };

  if (platform === "win32") {
    for (const toolName of windowsToolNames(name)) {
      push(path.join(toolsBin, toolName));
    }

    const programFiles = env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = env.LOCALAPPDATA || path.join(home, "AppData", "Local");

    if (name === "node" || name === "npm" || name === "npx") {
      for (const root of [
        path.join(programFiles, "nodejs"),
        path.join(programFilesX86, "nodejs"),
        path.join(localAppData, "Programs", "nodejs"),
      ]) {
        for (const toolName of windowsToolNames(name)) {
          push(path.join(root, toolName));
        }
      }
    }

    if (name === "git") {
      for (const root of [
        path.join(programFiles, "Git"),
        path.join(programFilesX86, "Git"),
        path.join(localAppData, "Programs", "Git"),
      ]) {
        push(path.join(root, "cmd", "git.exe"));
        push(path.join(root, "bin", "git.exe"));
      }
    }

    if (name === "gh") {
      for (const root of [
        path.join(programFiles, "GitHub CLI"),
        path.join(localAppData, "Programs", "GitHub CLI"),
      ]) {
        push(path.join(root, "gh.exe"));
      }
    }

    // Also scan PATH entries (Electron often has a reduced PATH).
    const pathValue = env.Path || env.PATH || "";
    for (const dir of pathValue.split(";").map((p) => p.trim()).filter(Boolean)) {
      for (const toolName of windowsToolNames(name)) {
        push(path.join(dir, toolName));
      }
    }

    return out;
  }

  push(path.join(toolsBin, name));
  push(path.join(home, ".local", "bin", name));
  push(path.join("/opt/homebrew/bin", name));
  push(path.join("/usr/local/bin", name));
  push(path.join(home, ".nvm", "current", "bin", name));
  push(path.join("/usr/bin", name));
  push(path.join("/bin", name));
  return out;
}

async function resolveViaWhere(name: string): Promise<string | null> {
  // `where` prints every match; take the first existing file.
  const result = await runCapture("where.exe", [name]);
  if (!result.ok && !result.stdout) return null;
  for (const line of result.stdout.split(/\r?\n/).map((p) => p.trim()).filter(Boolean)) {
    if (await pathIsRunnable(line)) return line;
  }
  return null;
}

async function resolveViaLoginShell(name: string): Promise<string | null> {
  const shell = process.env.SHELL || "/bin/zsh";
  const result = await runCapture(shell, ["-ilc", `command -v ${name} 2>/dev/null || true`]);
  const line = stripShellNoise(result.stdout)
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .reverse()
    .find((p) => p.startsWith("/") && (p.endsWith(`/${name}`) || p === name));
  if (line && (await pathIsRunnable(line))) {
    return line;
  }
  return null;
}

async function resolveWhich(name: string): Promise<string | null> {
  // 1) Prefer direct filesystem checks — reliable in packaged Electron.
  for (const candidate of candidatePathsFor(name)) {
    if (await pathIsRunnable(candidate)) {
      return candidate;
    }
  }

  // 2) OS lookup as a fallback (PATH / nvm / Git for Windows, etc.).
  if (process.platform === "win32") {
    return resolveViaWhere(name);
  }

  return resolveViaLoginShell(name);
}

async function probeTool(id: DevToolId): Promise<DevToolStatus> {
  const meta = TOOL_META[id];
  const bin = await resolveWhich(id);
  if (!bin) {
    return {
      id,
      label: meta.label,
      description: meta.description,
      required: meta.required,
      installed: false,
      version: null,
      path: null,
    };
  }

  const version = await runCapture(bin, meta.versionArgs);
  const text = version.stdout || version.stderr;
  // macOS git stub when Xcode CLT is missing
  if (id === "git" && /xcode-select|Command Line Tools/i.test(text)) {
    return {
      id,
      label: meta.label,
      description: meta.description,
      required: meta.required,
      installed: false,
      version: null,
      path: bin,
    };
  }

  // Some CLIs print version info but still exit 0; accept usable version text.
  const installed = Boolean(text) && (version.ok || /^\s*v?\d+/.test(text) || /version/i.test(text));

  return {
    id,
    label: meta.label,
    description: meta.description,
    required: meta.required,
    installed,
    version: text.split("\n").find((l) => l.trim()) || null,
    path: bin,
  };
}

export async function getDevToolsStatus(): Promise<DevToolStatus[]> {
  clearShellEnvCache();
  const ids: DevToolId[] = ["node", "git", "gh"];
  return Promise.all(ids.map((id) => probeTool(id)));
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(toolsBinDir(), { recursive: true });
  await fs.mkdir(path.join(toolsRoot(), "downloads"), { recursive: true });
}

async function downloadFile(url: string, dest: string, log: DevToolsLogFn): Promise<void> {
  log(`Downloading ${url}`);
  const res = await fetch(url, {
    headers: { "User-Agent": "OmniSync" },
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const bytes = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, bytes);
  log(`Saved to ${dest}`);
}

async function runCommand(command: string, args: string[], log: DevToolsLogFn): Promise<void> {
  log(`> ${command} ${args.join(" ")}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: augmentProcessEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim()) log(line.trim());
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim()) log(line.trim());
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function hasBrew(): Promise<boolean> {
  const brew = await resolveWhich("brew");
  return Boolean(brew);
}

async function brewInstall(formula: string, log: DevToolsLogFn): Promise<void> {
  const brew = (await resolveWhich("brew")) || "brew";
  await runCommand(brew, ["install", formula], log);
}

async function linkIntoToolsBin(source: string, name: string, log: DevToolsLogFn): Promise<void> {
  const destName = process.platform === "win32" && !/\.(exe|cmd|bat)$/i.test(name) ? `${name}.exe` : name;
  const dest = path.join(toolsBinDir(), destName);
  try {
    await fs.rm(dest, { force: true });
  } catch {
    // ignore
  }
  if (process.platform === "win32") {
    // Symlinks often need admin on Windows — copy instead.
    await fs.copyFile(source, dest);
    log(`Copied ${destName} ← ${source}`);
    return;
  }
  await fs.symlink(source, dest);
  log(`Linked ${name} → ${source}`);
}

async function installNode(log: DevToolsLogFn): Promise<void> {
  await ensureDirs();
  if (process.platform !== "win32" && (await hasBrew())) {
    log("Homebrew detected — installing Node.js via brew…");
    await brewInstall("node", log);
    clearShellEnvCache();
    return;
  }

  log("Installing a local Node.js toolchain…");
  const indexRes = await fetch("https://nodejs.org/dist/index.json", {
    headers: { "User-Agent": "OmniSync" },
  });
  if (!indexRes.ok) throw new Error("Could not fetch Node.js release index");
  const index = (await indexRes.json()) as Array<{ version: string; lts: string | false }>;
  const lts = index.find((entry) => Boolean(entry.lts));
  if (!lts) throw new Error("No Node.js LTS release found");

  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const version = lts.version; // e.g. v22.17.0
  const isWin = process.platform === "win32";
  const platform = isWin ? "win" : process.platform === "darwin" ? "darwin" : "linux";
  const folder = `node-${version}-${platform}-${arch}`;
  const archive = isWin ? `${folder}.zip` : `${folder}.tar.gz`;
  const url = `https://nodejs.org/dist/${version}/${archive}`;
  const downloadPath = path.join(toolsRoot(), "downloads", archive);
  const extractRoot = path.join(toolsRoot(), "node");

  await downloadFile(url, downloadPath, log);
  await fs.rm(extractRoot, { recursive: true, force: true });
  await fs.mkdir(extractRoot, { recursive: true });

  if (isWin) {
    await runCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath '${downloadPath.replace(/'/g, "''")}' -DestinationPath '${extractRoot.replace(/'/g, "''")}' -Force`,
      ],
      log
    );
  } else {
    await runCommand("tar", ["-xzf", downloadPath, "-C", extractRoot], log);
  }

  const nodeHome = path.join(extractRoot, folder);
  if (isWin) {
    // Windows zip lays out binaries at the folder root (node.exe, npm.cmd, …).
    for (const bin of ["node.exe", "npm.cmd", "npx.cmd"]) {
      await linkIntoToolsBin(path.join(nodeHome, bin), bin, log);
    }
  } else {
    for (const bin of ["node", "npm", "npx"]) {
      await linkIntoToolsBin(path.join(nodeHome, "bin", bin), bin, log);
    }
  }
  clearShellEnvCache();
}

async function installGh(log: DevToolsLogFn): Promise<void> {
  await ensureDirs();
  if (process.platform !== "win32" && (await hasBrew())) {
    log("Homebrew detected — installing GitHub CLI via brew…");
    await brewInstall("gh", log);
    clearShellEnvCache();
    return;
  }

  log("Installing a local GitHub CLI binary…");
  const releaseRes = await fetch("https://api.github.com/repos/cli/cli/releases/latest", {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "OmniSync",
    },
  });
  if (!releaseRes.ok) throw new Error("Could not fetch GitHub CLI release metadata");
  const release = (await releaseRes.json()) as {
    assets?: Array<{ name: string; browser_download_url: string }>;
  };
  const archToken = process.arch === "arm64" ? "arm64" : "amd64";
  const asset = (release.assets || []).find((a) => {
    if (process.platform === "win32") {
      return a.name.includes("windows") && a.name.includes(archToken) && a.name.endsWith(".zip");
    }
    if (process.platform === "darwin") {
      return a.name.includes("macOS") && a.name.includes(archToken) && a.name.endsWith(".zip");
    }
    return a.name.includes("linux") && a.name.includes(archToken) && a.name.endsWith(".tar.gz");
  });
  if (!asset) throw new Error("No compatible GitHub CLI binary found for this platform");

  const downloadPath = path.join(toolsRoot(), "downloads", asset.name);
  await downloadFile(asset.browser_download_url, downloadPath, log);

  const extractDir = path.join(tmpdir(), `omnisync-gh-${Date.now()}`);
  await fs.mkdir(extractDir, { recursive: true });
  if (asset.name.endsWith(".zip")) {
    if (process.platform === "win32") {
      await runCommand(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Expand-Archive -LiteralPath '${downloadPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
        ],
        log
      );
    } else {
      await runCommand("unzip", ["-o", downloadPath, "-d", extractDir], log);
    }
  } else {
    await runCommand("tar", ["-xzf", downloadPath, "-C", extractDir], log);
  }

  // Archive layout: gh_x.y.z_<os>_<arch>/bin/gh[.exe]
  const entries = await fs.readdir(extractDir);
  const rootName = entries.find((e) => e.startsWith("gh_")) || entries[0];
  const ghBinary = path.join(
    extractDir,
    rootName,
    "bin",
    process.platform === "win32" ? "gh.exe" : "gh"
  );
  await fs.access(ghBinary);
  const permanent = path.join(toolsRoot(), "gh", "bin");
  await fs.mkdir(permanent, { recursive: true });
  const target = path.join(permanent, process.platform === "win32" ? "gh.exe" : "gh");
  await fs.copyFile(ghBinary, target);
  if (process.platform !== "win32") {
    await fs.chmod(target, 0o755);
  }
  await linkIntoToolsBin(target, process.platform === "win32" ? "gh.exe" : "gh", log);
  clearShellEnvCache();
}

async function installGit(log: DevToolsLogFn): Promise<void> {
  await ensureDirs();
  if (process.platform !== "win32" && (await hasBrew())) {
    log("Homebrew detected — installing Git via brew…");
    await brewInstall("git", log);
    clearShellEnvCache();
    return;
  }

  if (process.platform === "darwin") {
    log("Opening Apple’s Command Line Tools installer for Git…");
    log("Complete the macOS dialog, then return here — we’ll detect Git automatically.");
    try {
      await runCommand("xcode-select", ["--install"], log);
    } catch (err) {
      // Already installed or dialog already open — still re-probe afterwards.
      const msg = err instanceof Error ? err.message : String(err);
      log(msg);
    }
    clearShellEnvCache();
    return;
  }

  if (process.platform === "win32") {
    const url = "https://git-scm.com/download/win";
    log(`Opening ${url} — install Git for Windows, then click Refresh.`);
    try {
      await runCommand("cmd.exe", ["/c", "start", "", url], log);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(msg);
    }
    clearShellEnvCache();
    return;
  }

  throw new Error("Automatic Git install is only supported via Homebrew, macOS Command Line Tools, or Git for Windows.");
}

export async function installDevTool(id: DevToolId, log: DevToolsLogFn): Promise<void> {
  log(`Installing ${TOOL_META[id].label}…`);
  if (id === "node") await installNode(log);
  else if (id === "gh") await installGh(log);
  else if (id === "git") await installGit(log);
  else throw new Error(`Unknown tool: ${id}`);

  clearShellEnvCache();
  const status = await probeTool(id);
  if (!status.installed) {
    const hint =
      id === "git"
        ? process.platform === "win32"
          ? "Finish the Git for Windows installer, then click Refresh."
          : "Finish the Command Line Tools installer, then click Refresh."
        : process.platform === "win32"
          ? "Try again, or install from nodejs.org / GitHub CLI releases."
          : "Try again or install via Homebrew.";
    throw new Error(`${TOOL_META[id].label} is still not available on PATH. ${hint}`);
  }
  log(`${TOOL_META[id].label} ready (${status.version}).`);
}

export async function installMissingDevTools(log: DevToolsLogFn): Promise<DevToolStatus[]> {
  const before = await getDevToolsStatus();
  for (const tool of before) {
    if (tool.required && !tool.installed) {
      await installDevTool(tool.id, log);
    }
  }
  return getDevToolsStatus();
}

/** Smoke-test helper used by unit tests. */
export async function canSpawnTool(name: string): Promise<boolean> {
  try {
    const child = spawnTool(name, ["--version"], {});
    return await new Promise((resolve) => {
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  } catch {
    return false;
  }
}
