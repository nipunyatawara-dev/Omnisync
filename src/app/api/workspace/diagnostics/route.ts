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

function parseGithubOwnerRepo(remoteUrl: string | null): { owner: string; repo: string } | null {
  if (!remoteUrl) return null;
  const match = remoteUrl
    .trim()
    .replace(/\.git$/, "")
    .match(/github\.com[:/]([^/]+)\/([^/]+)$/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function githubApiHeaders(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "OmniSync",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchGithubRepoDescription(
  remoteUrl: string | null,
  token?: string
): Promise<string | null> {
  const parsed = parseGithubOwnerRepo(remoteUrl);
  if (!parsed) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
      headers: githubApiHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { description?: string | null };
    const description = data.description?.trim();
    return description || null;
  } catch {
    return null;
  }
}

interface GithubReleaseSummary {
  tagName: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  htmlUrl: string;
}

interface GithubDeploymentSummary {
  id: number;
  environment: string;
  description: string;
  createdAt: string;
  state: string;
  url?: string;
}

async function fetchGithubReleases(
  remoteUrl: string | null,
  token?: string,
  limit = 5
): Promise<GithubReleaseSummary[]> {
  const parsed = parseGithubOwnerRepo(remoteUrl);
  if (!parsed) return [];
  try {
    const res = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/releases?per_page=${limit}`,
      { headers: githubApiHeaders(token), cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      tag_name?: string;
      name?: string | null;
      published_at?: string | null;
      prerelease?: boolean;
      html_url?: string;
      draft?: boolean;
    }>;
    if (!Array.isArray(data)) return [];
    return data
      .filter((r) => !r.draft && r.tag_name)
      .map((r) => ({
        tagName: r.tag_name || "",
        name: (r.name || r.tag_name || "").trim(),
        publishedAt: r.published_at || "",
        prerelease: !!r.prerelease,
        htmlUrl: r.html_url || "",
      }));
  } catch {
    return [];
  }
}

async function fetchGithubDeployments(
  remoteUrl: string | null,
  token?: string,
  limit = 5
): Promise<GithubDeploymentSummary[]> {
  const parsed = parseGithubOwnerRepo(remoteUrl);
  if (!parsed) return [];
  try {
    const res = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/deployments?per_page=${limit}`,
      { headers: githubApiHeaders(token), cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      id?: number;
      environment?: string;
      description?: string | null;
      created_at?: string;
      statuses_url?: string;
      url?: string;
    }>;
    if (!Array.isArray(data)) return [];

    const summaries = await Promise.all(
      data.slice(0, limit).map(async (d) => {
        let state = "unknown";
        let statusUrl = "";
        if (d.statuses_url) {
          try {
            const statusRes = await fetch(`${d.statuses_url}?per_page=1`, {
              headers: githubApiHeaders(token),
              cache: "no-store",
            });
            if (statusRes.ok) {
              const statuses = (await statusRes.json()) as Array<{
                state?: string;
                environment_url?: string | null;
                target_url?: string | null;
              }>;
              if (Array.isArray(statuses) && statuses[0]) {
                state = statuses[0].state || state;
                statusUrl = statuses[0].environment_url || statuses[0].target_url || "";
              }
            }
          } catch {
            // keep unknown state
          }
        }
        return {
          id: d.id || 0,
          environment: d.environment || "unknown",
          description: (d.description || "").trim(),
          createdAt: d.created_at || "",
          state,
          url: statusUrl || undefined,
        };
      })
    );
    return summaries.filter((d) => d.id > 0);
  } catch {
    return [];
  }
}

async function readReadmeDescription(cwd: string): Promise<string | null> {
  for (const name of ["README.md", "readme.md", "README"]) {
    try {
      const content = await fs.readFile(path.join(cwd, name), "utf-8");
      const chunks: string[] = [];
      for (const raw of content.split("\n")) {
        const line = raw.trim();
        if (!line) {
          if (chunks.length > 0) break;
          continue;
        }
        if (line.startsWith("#")) continue;
        if (line.startsWith("![") || line.startsWith("[![")) continue;
        chunks.push(line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
        if (chunks.join(" ").length > 220) break;
      }
      const text = chunks.join(" ").replace(/\s+/g, " ").trim();
      if (text) return text.length > 240 ? `${text.slice(0, 237)}…` : text;
    } catch {
      // try next filename
    }
  }
  return null;
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
  const dependencyDetails: { name: string; version: string; installed: boolean }[] = [];
  const packageJsonExists = await pathExists(packageJsonPath);

  let projectName = "Unnamed Project";
  let projectVersion = "1.0.0";
  let projectDescription = "";
  let projectLicense = "MIT";

  if (packageJsonExists) {
    try {
      const pkgContent = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(pkgContent);
      enginesNode = pkg.engines?.node || "*";
      dependencies = { ...pkg.dependencies, ...pkg.devDependencies };

      projectName = pkg.name || projectName;
      projectVersion = pkg.version || projectVersion;
      projectDescription = typeof pkg.description === "string" ? pkg.description.trim() : "";
      projectLicense = pkg.license || projectLicense;

      const depChecks = await Promise.all(
        Object.keys(dependencies).map(async (dep) => ({
          dep,
          version: dependencies[dep],
          exists: await pathExists(path.join(cwd, "node_modules", dep)),
        }))
      );
      for (const { dep, version, exists } of depChecks) {
        dependencyDetails.push({ name: dep, version, installed: exists });
        if (!exists) missingDeps.push(dep);
      }
      dependencyDetails.sort((a, b) => a.name.localeCompare(b.name));
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

  const [githubDescription, releases, deployments] = await Promise.all([
    projectDescription
      ? Promise.resolve(null)
      : fetchGithubRepoDescription(remoteUrl, profile.gitToken),
    fetchGithubReleases(remoteUrl, profile.gitToken),
    fetchGithubDeployments(remoteUrl, profile.gitToken),
  ]);

  if (!projectDescription) {
    projectDescription =
      githubDescription || (await readReadmeDescription(cwd)) || "No description available";
  }

  return NextResponse.json({
    nodeVersion,
    npmVersion,
    enginesNode,
    isNodeCompatible,
    packageJsonExists,
    totalDependencies: Object.keys(dependencies).length,
    missingDependencies: missingDeps,
    dependencies: dependencyDetails,
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
    releases,
    deployments,
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
