import { NextResponse } from "next/server";
import { getActiveProfile } from "@/lib/profiles";
import { getGlobalSettings } from "@/lib/globalSettings";
import { execFile } from "child_process";
import {
  getCurrentBranch,
  getBranches,
  getSyncStatus,
  getFileCommits,
  getCommitDiff,
  getConflictFiles,
  parseConflictFile,
  getAllRepoCommits,
  applyGitIdentity,
  gitFetch,
  gitPull,
  gitPush,
  isDirectCommitBlocked,
  GitCommandError,
} from "@/lib/git";
import path from "path";

async function ensureWorkspaceGitConfig(cwd: string) {
  const global = await getGlobalSettings();
  if (global.gitUsername || global.gitEmail) {
    await applyGitIdentity(cwd, global.gitUsername, global.gitEmail);
  }
}

function gitErrorResponse(err: unknown, fallback: string) {
  if (err instanceof GitCommandError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const msg = err instanceof Error ? err.message : fallback;
  console.error(`[git] ${fallback}:`, err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

async function syncResponse(cwd: string, defaultBranch: string) {
  const sync = await getSyncStatus(cwd, defaultBranch);
  return { success: true, sync };
}

export async function GET(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;
  const global = await getGlobalSettings();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    if (action === "all-commits") {
      const commits = await getAllRepoCommits(cwd);
      return NextResponse.json({ commits });
    }

    if (action === "branches") {
      await ensureWorkspaceGitConfig(cwd);
      const branches = await getBranches(cwd);
      const current = await getCurrentBranch(cwd);
      return NextResponse.json({ branches, current });
    }

    if (action === "status") {
      await ensureWorkspaceGitConfig(cwd);
      const sync = await getSyncStatus(cwd, global.defaultBranch);
      const current = await getCurrentBranch(cwd);
      const intervalMinutes = parseInt(global.autoFetchInterval, 10) || 0;
      return NextResponse.json({
        sync,
        branchProtected: isDirectCommitBlocked(profile, current),
        autoFetchEnabled: profile.autoFetch !== false && intervalMinutes > 0,
        autoFetchIntervalMinutes: intervalMinutes,
      });
    }

    if (action === "commits") {
      const file = searchParams.get("file");
      if (!file) return NextResponse.json({ error: "File parameter missing" }, { status: 400 });
      const commits = await getFileCommits(cwd, file);
      return NextResponse.json({ commits });
    }

    if (action === "diff") {
      const commit = searchParams.get("commit");
      const file = searchParams.get("file");
      if (!commit || !file) {
        return NextResponse.json({ error: "Commit or file parameter missing" }, { status: 400 });
      }
      const diff = await getCommitDiff(cwd, commit, file);
      return NextResponse.json({ diff });
    }

    if (action === "conflicts") {
      const conflicts = await getConflictFiles(cwd);
      return NextResponse.json({ conflicts });
    }

    if (action === "conflict-details") {
      const file = searchParams.get("file");
      if (!file) return NextResponse.json({ error: "File parameter missing" }, { status: 400 });
      const rootPath = path.resolve(cwd);
      const fullPath = path.resolve(rootPath, file);
      if (!fullPath.startsWith(rootPath + path.sep) && fullPath !== rootPath) {
        return NextResponse.json({ error: "Access denied: Invalid file path" }, { status: 403 });
      }
      const details = await parseConflictFile(fullPath);
      return NextResponse.json(details);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    return gitErrorResponse(err, "Failed to read git data");
  }
}

export async function POST(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;
  const global = await getGlobalSettings();
  const token = profile.gitToken;

  try {
    const body = await request.json();
    const { action, branch } = body;

    if (action === "fetch") {
      await gitFetch(cwd, token);
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
    }

    if (action === "pull") {
      await gitPull(cwd, token);
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
    }

    if (action === "push") {
      const current = await getCurrentBranch(cwd);
      if (isDirectCommitBlocked(profile, current)) {
        return NextResponse.json(
          { error: "Push to main/master is disabled by branch protection." },
          { status: 403 }
        );
      }
      await gitPush(cwd, token);
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
    }

    if (action === "commit") {
      const current = await getCurrentBranch(cwd);
      if (isDirectCommitBlocked(profile, current)) {
        return NextResponse.json(
          { error: "Direct commits to main/master are disabled by branch protection." },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: "Commit action is not implemented yet." }, { status: 501 });
    }

    if (action === "switch-branch") {
      if (!branch || typeof branch !== "string") {
        return NextResponse.json({ error: "Branch parameter missing" }, { status: 400 });
      }

      const branches = await getBranches(cwd);
      if (!branches.includes(branch)) {
        return NextResponse.json({ error: "Unknown branch" }, { status: 400 });
      }

      await new Promise<void>((resolve, reject) => {
        execFile("git", ["checkout", branch], { cwd, timeout: 15000 }, (err, _stdout, stderr) => {
          if (err) {
            reject(new GitCommandError((stderr || err.message).trim()));
          } else {
            resolve();
          }
        });
      });

      const current = await getCurrentBranch(cwd);
      return NextResponse.json({
        success: true,
        current,
        branchProtected: isDirectCommitBlocked(profile, current),
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    return gitErrorResponse(err, "Failed to perform git operation");
  }
}
