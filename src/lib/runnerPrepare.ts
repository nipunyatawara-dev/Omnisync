import { promises as fs } from "fs";
import path from "path";
import { spawnLoginCommand } from "@/lib/shellEnv";
import { augmentProcessEnv } from "@/lib/shellEnv";
import { resolveDependencyInstallArgs } from "@/lib/npmInstall";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function isDevRunCommand(runCommand: string): boolean {
  const cmd = runCommand.toLowerCase();
  return (/\bdev\b/.test(cmd) || cmd.includes("next dev")) && !/\bstart\b/.test(cmd);
}

function isProductionRunCommand(runCommand: string): boolean {
  const cmd = runCommand.toLowerCase();
  return /\bstart\b/.test(cmd) || cmd.includes("next start") || cmd.includes("run preview");
}

export async function runShellCommand(
  cwd: string,
  command: string,
  onLine?: (line: string) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawnLoginCommand(command, {
      cwd,
      env: augmentProcessEnv({ ...process.env, FORCE_COLOR: "1" }),
    });

    const handleData = (data: Buffer, isError = false) => {
      const prefix = isError ? "[ERROR] " : "";
      data
        .toString()
        .split("\n")
        .forEach((line) => {
          const trimmed = line.trim();
          if (trimmed) onLine?.(`${prefix}${trimmed}`);
        });
    };

    child.stdout?.on("data", (data) => handleData(data));
    child.stderr?.on("data", (data) => handleData(data, true));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export async function prepareWorkspaceForRunner(
  cwd: string,
  options: {
    runCommand: string;
    buildCommand?: string;
    onLog?: (line: string) => void;
  }
): Promise<void> {
  const { runCommand, buildCommand = "npm run build", onLog } = options;
  const log = (line: string) => onLog?.(line);

  const packageJsonPath = path.join(cwd, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    log("No package.json found — starting command without install/build preflight.");
    return;
  }

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
  } catch {
    throw new Error("Could not read package.json in workspace.");
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const isNextProject = Boolean(deps.next);
  const nodeModulesPath = path.join(cwd, "node_modules");

  if (!(await pathExists(nodeModulesPath))) {
    const installArgs = await resolveDependencyInstallArgs(cwd);
    const installCommand = `npm ${installArgs.join(" ")}`;
    log("node_modules is missing — installing dependencies first...");
    log(`Executing: ${installCommand}`);
    const installCode = await runShellCommand(cwd, installCommand, log);
    if (installCode !== 0) {
      throw new Error(`Dependency install failed with exit code ${installCode}`);
    }
    log("Dependencies installed successfully.");
  }

  const buildIdPath = path.join(cwd, ".next", "BUILD_ID");
  const hasBuild = await pathExists(buildIdPath);
  const shouldBuild =
    isNextProject &&
    !hasBuild &&
    (isProductionRunCommand(runCommand) || !isDevRunCommand(runCommand));

  if (shouldBuild) {
    log(".next build output is missing — running build command before starting server...");
    log(`Executing: ${buildCommand}`);
    const buildCode = await runShellCommand(cwd, buildCommand, log);
    if (buildCode !== 0) {
      throw new Error(`Build failed with exit code ${buildCode}`);
    }
    log("Build completed successfully.");
  } else if (isNextProject && !hasBuild && isDevRunCommand(runCommand)) {
    log("No .next folder yet — dev server will create it on first compile.");
  }
}
