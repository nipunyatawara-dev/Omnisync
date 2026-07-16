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

async function pathIsExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Well-known locations GUI/Electron apps often miss when login PATH is incomplete. */
function candidatePaths(name: string): string[] {
  const home = homedir();
  return [
    path.join(toolsBinDir(), name),
    path.join(home, ".local", "bin", name),
    path.join("/opt/homebrew/bin", name),
    path.join("/usr/local/bin", name),
    path.join(home, ".nvm", "current", "bin", name),
    path.join("/usr/bin", name),
    path.join("/bin", name),
  ];
}

async function resolveWhich(name: string): Promise<string | null> {
  // 1) Prefer direct filesystem checks — reliable in packaged Electron.
  for (const candidate of candidatePaths(name)) {
    if (await pathIsExecutable(candidate)) {
      return candidate;
    }
  }

  // 2) Login-shell lookup as a fallback (nvm/fnm/volta shims, etc.).
  const result = await runCapture("/bin/zsh", ["-ilc", `command -v ${name} 2>/dev/null || true`]);
  const line = stripShellNoise(result.stdout)
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .reverse()
    .find((p) => p.startsWith("/") && (p.endsWith(`/${name}`) || p === name));
  if (line && (await pathIsExecutable(line))) {
    return line;
  }

  return null;
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
  const dest = path.join(toolsBinDir(), name);
  try {
    await fs.rm(dest, { force: true });
  } catch {
    // ignore
  }
  await fs.symlink(source, dest);
  log(`Linked ${name} → ${source}`);
}

async function installNode(log: DevToolsLogFn): Promise<void> {
  await ensureDirs();
  if (await hasBrew()) {
    log("Homebrew detected — installing Node.js via brew…");
    await brewInstall("node", log);
    clearShellEnvCache();
    return;
  }

  log("Homebrew not found — installing a local Node.js toolchain…");
  const indexRes = await fetch("https://nodejs.org/dist/index.json", {
    headers: { "User-Agent": "OmniSync" },
  });
  if (!indexRes.ok) throw new Error("Could not fetch Node.js release index");
  const index = (await indexRes.json()) as Array<{ version: string; lts: string | false }>;
  const lts = index.find((entry) => Boolean(entry.lts));
  if (!lts) throw new Error("No Node.js LTS release found");

  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const version = lts.version; // e.g. v22.17.0
  const folder = `node-${version}-${platform}-${arch}`;
  const archive = `${folder}.tar.gz`;
  const url = `https://nodejs.org/dist/${version}/${archive}`;
  const downloadPath = path.join(toolsRoot(), "downloads", archive);
  const extractRoot = path.join(toolsRoot(), "node");

  await downloadFile(url, downloadPath, log);
  await fs.rm(extractRoot, { recursive: true, force: true });
  await fs.mkdir(extractRoot, { recursive: true });
  await runCommand("tar", ["-xzf", downloadPath, "-C", extractRoot], log);

  const nodeHome = path.join(extractRoot, folder);
  for (const bin of ["node", "npm", "npx"]) {
    await linkIntoToolsBin(path.join(nodeHome, "bin", bin), bin, log);
  }
  clearShellEnvCache();
}

async function installGh(log: DevToolsLogFn): Promise<void> {
  await ensureDirs();
  if (await hasBrew()) {
    log("Homebrew detected — installing GitHub CLI via brew…");
    await brewInstall("gh", log);
    clearShellEnvCache();
    return;
  }

  log("Homebrew not found — installing a local GitHub CLI binary…");
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
  const asset = (release.assets || []).find((a) =>
    process.platform === "darwin"
      ? a.name.includes("macOS") && a.name.includes(archToken) && a.name.endsWith(".zip")
      : a.name.includes("linux") && a.name.includes(archToken) && a.name.endsWith(".tar.gz")
  );
  if (!asset) throw new Error("No compatible GitHub CLI binary found for this Mac");

  const downloadPath = path.join(toolsRoot(), "downloads", asset.name);
  await downloadFile(asset.browser_download_url, downloadPath, log);

  const extractDir = path.join(tmpdir(), `omnisync-gh-${Date.now()}`);
  await fs.mkdir(extractDir, { recursive: true });
  if (asset.name.endsWith(".zip")) {
    await runCommand("unzip", ["-o", downloadPath, "-d", extractDir], log);
  } else {
    await runCommand("tar", ["-xzf", downloadPath, "-C", extractDir], log);
  }

  // Archive layout: gh_x.y.z_macOS_arm64/bin/gh
  const entries = await fs.readdir(extractDir);
  const rootName = entries.find((e) => e.startsWith("gh_")) || entries[0];
  const ghBinary = path.join(extractDir, rootName, "bin", "gh");
  await fs.access(ghBinary);
  const permanent = path.join(toolsRoot(), "gh", "bin");
  await fs.mkdir(permanent, { recursive: true });
  const target = path.join(permanent, "gh");
  await fs.copyFile(ghBinary, target);
  await fs.chmod(target, 0o755);
  await linkIntoToolsBin(target, "gh", log);
  clearShellEnvCache();
}

async function installGit(log: DevToolsLogFn): Promise<void> {
  await ensureDirs();
  if (await hasBrew()) {
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

  throw new Error("Automatic Git install is only supported via Homebrew or macOS Command Line Tools.");
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
    throw new Error(
      `${TOOL_META[id].label} is still not available on PATH. ${
        id === "git"
          ? "Finish the Command Line Tools installer, then click Refresh."
          : "Try again or install via Homebrew."
      }`
    );
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
