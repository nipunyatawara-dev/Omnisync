import { NextResponse } from "next/server";
import { getActiveProfile, getProfileById } from "@/lib/profiles";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { getCurrentBranch, getRemoteOriginUrl, resolveGitIdentity } from "@/lib/git";
import {
  resetBrokenEsbuildInstall,
  resolveDependencyInstallArgs,
  sanitizeNpmInstallLogLine,
  stripTerminalEscapeSequences,
} from "@/lib/npmInstall";
import { augmentProcessEnv, spawnTool } from "@/lib/shellEnv";
import {
  appendTerminalLine,
  buildTerminalPrompt,
  logTerminalCommand,
  setTerminalPrompt,
} from "@/lib/dashboardTerminal";
import { buildWorkspaceChildEnv } from "@/lib/workspaceProcessEnv";

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId");
  const profile = profileId ? await getProfileById(profileId) : await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;
  const packageJsonPath = path.join(cwd, "package.json");

  const nodeVersion = process.version;
  let npmVersion = "unknown";
  try {
    npmVersion = await new Promise<string>((resolve) => {
      execFile(npmCmd, ["-v"], { encoding: "utf-8", timeout: 10000, env: augmentProcessEnv() }, (err, stdout) => {
        resolve(err ? "unknown" : stdout.trim());
      });
    });
  } catch {}

  let enginesNode = "*";
  let dependencies: Record<string, string> = {};
  const missingDeps: string[] = [];
  const packageJsonExists = await pathExists(packageJsonPath);

  let projectName = "Unnamed Project";
  let projectVersion = "1.0.0";
  let projectDescription = "No description available";
  let projectLicense = "MIT";

  if (packageJsonExists) {
    try {
      const pkgContent = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(pkgContent);
      enginesNode = pkg.engines?.node || "*";
      dependencies = { ...pkg.dependencies, ...pkg.devDependencies };

      projectName = pkg.name || projectName;
      projectVersion = pkg.version || projectVersion;
      projectDescription = pkg.description || projectDescription;
      projectLicense = pkg.license || projectLicense;

      const depChecks = await Promise.all(
        Object.keys(dependencies).map(async (dep) => ({
          dep,
          exists: await pathExists(path.join(cwd, "node_modules", dep)),
        }))
      );
      for (const { dep, exists } of depChecks) {
        if (!exists) missingDeps.push(dep);
      }
    } catch {}
  }

  // Node compatibility check
  let isNodeCompatible = true;
  if (enginesNode !== "*") {
    const requiredMajorMatch = enginesNode.match(/\d+/);
    const activeMajorMatch = nodeVersion.match(/\d+/);
    if (requiredMajorMatch && activeMajorMatch) {
      const requiredMajor = parseInt(requiredMajorMatch[0], 10);
      const activeMajor = parseInt(activeMajorMatch[0], 10);
      if (enginesNode.includes(">=") && activeMajor < requiredMajor) {
        isNodeCompatible = false;
      }
    }
  }

  // Check git status
  let gitStatus = "Clean";
  try {
    const gitOut = await new Promise<string>((resolve, reject) => {
      execFile("git", ["status", "--porcelain"], { cwd, encoding: "utf-8", timeout: 15000, env: augmentProcessEnv() }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
    if (gitOut) {
      gitStatus = "Modified changes present";
    }
  } catch {
    gitStatus = "Not a Git repository";
  }

  // Fetch OS hostname and username
  let username = "user";
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER || "user";
  }

  let hostname = "localhost";
  try {
    hostname = os.hostname().replace(/\.local$/, "");
  } catch {}

  const folderName = path.basename(cwd);
  const nodeModulesExists = await pathExists(path.join(cwd, "node_modules"));

  let currentBranch: string | null = null;
  let remoteUrl: string | null = null;
  let gitAuthorName = "";
  let gitAuthorEmail = "";
  if (gitStatus !== "Not a Git repository") {
    try {
      currentBranch = await getCurrentBranch(cwd);
      remoteUrl = await getRemoteOriginUrl(cwd);
      const identity = await resolveGitIdentity(cwd);
      gitAuthorName = identity.name;
      gitAuthorEmail = identity.email;
    } catch {}
  }

  return NextResponse.json({
    nodeVersion,
    npmVersion,
    enginesNode,
    isNodeCompatible,
    packageJsonExists,
    totalDependencies: Object.keys(dependencies).length,
    missingDependencies: missingDeps,
    gitStatus,
    projectName,
    projectVersion,
    projectDescription,
    projectLicense,
    username,
    hostname,
    folderName,
    nodeModulesExists,
    currentBranch,
    remoteUrl,
    gitAuthorName,
    gitAuthorEmail,
  });
}

export async function POST(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;

  try {
    const { action, cleanModules } = await request.json();
    const encoder = new TextEncoder();

    const cmd = npmCmd;
    let args: string[] = [];

    if (action === "clean-cache") {
      args = ["cache", "clean", "--force"];
    } else if (action === "clean-modules") {
      const nodeModulesPath = path.join(cwd, "node_modules");
      try {
        await fs.rm(nodeModulesPath, { recursive: true, force: true });
      } catch {}
      args = await resolveDependencyInstallArgs(cwd);
    } else if (action === "audit-fix") {
      args = ["audit", "fix", "--force"];
    } else if (action === "install") {
      args = await resolveDependencyInstallArgs(cwd);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const customStream = new ReadableStream({
      async start(controller) {
        setTerminalPrompt(buildTerminalPrompt(cwd));
        logTerminalCommand(`${cmd} ${args.join(" ")}`, "diagnostics");

        const sendLog = (message: string) => {
          const stripped = stripTerminalEscapeSequences(message);
          const clean = sanitizeNpmInstallLogLine(stripped);
          if (clean === null) return;
          appendTerminalLine(clean, "output");
          controller.enqueue(encoder.encode(JSON.stringify({ type: "log", message: clean }) + "\n"));
        };

        const sendError = (message: string) => {
          const stripped = stripTerminalEscapeSequences(message);
          const clean = sanitizeNpmInstallLogLine(stripped) ?? stripped.trim();
          if (!clean) return;
          appendTerminalLine(clean, "error");
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: clean }) + "\n"));
        };

        const closeStream = () => {
          try {
            controller.close();
          } catch {
            // Stream already closed.
          }
        };

        sendLog(`> Running maintenance command inside ${cwd}:`);
        sendLog(`> ${cmd} ${args.join(" ")}`);

        if (action === "install" || action === "clean-modules") {
          if (action === "install" && cleanModules === true) {
            const nodeModulesPath = path.join(cwd, "node_modules");
            try {
              await fs.rm(nodeModulesPath, { recursive: true, force: true });
              sendLog("> Removed node_modules for a clean install.");
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              sendLog(`> Warning: could not remove node_modules: ${msg}`);
            }
          }

          try {
            const resetMessage = await resetBrokenEsbuildInstall(cwd);
            if (resetMessage) {
              sendLog(`> ${resetMessage}`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            sendLog(`> Warning: could not reset esbuild: ${msg}`);
          }
        }

        const child = spawnTool(cmd, args, {
          cwd,
          env: buildWorkspaceChildEnv(cwd, { mode: "development" }),
        });

        child.stdout?.on("data", (data) => {
          const lines = data.toString().split("\n");
          lines.forEach((line: string) => {
            if (line.trim()) {
              sendLog(line);
            }
          });
        });

        child.stderr?.on("data", (data) => {
          const lines = data.toString().split("\n");
          lines.forEach((line: string) => {
            if (line.trim()) {
              sendLog(line);
            }
          });
        });

        child.on("error", (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("ENOENT") && cmd === "npm") {
            sendError(
              "npm was not found. Install Node.js (https://nodejs.org) or ensure npm is on your PATH in Terminal, then retry."
            );
          } else {
            sendError(`Failed to start command: ${msg}`);
          }
          closeStream();
        });

        child.on("close", (code) => {
          if (code !== 0) {
            sendError(`Command failed with exit code ${code}`);
          } else {
            sendLog(`> Command completed successfully.`);
            controller.enqueue(encoder.encode(JSON.stringify({ type: "success" }) + "\n"));
          }
          closeStream();
        });
      }
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err: unknown) {
    console.error("[diagnostics] POST failed:", err);
    return NextResponse.json({ error: "Maintenance command failed" }, { status: 500 });
  }
}
