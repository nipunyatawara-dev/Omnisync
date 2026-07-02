import { NextResponse } from "next/server";
import { getActiveProfile } from "@/lib/profiles";
import { execFile, spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { resetBrokenEsbuildInstall, npmInstallArgs } from "@/lib/npmInstall";

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

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;
  const packageJsonPath = path.join(cwd, "package.json");

  const nodeVersion = process.version;
  let npmVersion = "unknown";
  try {
    npmVersion = await new Promise<string>((resolve) => {
      execFile(npmCmd, ["-v"], { encoding: "utf-8", timeout: 10000 }, (err, stdout) => {
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
      execFile("git", ["status", "--porcelain"], { cwd, encoding: "utf-8", timeout: 15000 }, (err, stdout) => {
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
      args = npmInstallArgs(["install"]);
    } else if (action === "audit-fix") {
      args = ["audit", "fix", "--force"];
    } else if (action === "install") {
      args = npmInstallArgs(["install"]);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const customStream = new ReadableStream({
      async start(controller) {
        const sendLog = (message: string) => {
          const clean = message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
          controller.enqueue(encoder.encode(JSON.stringify({ type: "log", message: clean }) + "\n"));
        };

        const sendError = (message: string) => {
          const clean = message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: clean }) + "\n"));
        };

        const sendSuccess = () => {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "success" }) + "\n"));
          controller.close();
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

        const child = spawn(cmd, args, { cwd, shell: isWin });

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

        child.on("close", (code) => {
          if (code !== 0) {
            sendError(`Command failed with exit code ${code}`);
          } else {
            sendLog(`> Command completed successfully.`);
            sendSuccess();
          }
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
