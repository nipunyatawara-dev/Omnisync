import { NextResponse } from "next/server";
import { getActiveProfile, getGithubToken } from "@/lib/profiles";
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
  gitPullMerge,
  gitPullRebase,
  gitPush,
  gitWorkingStatus,
  gitStage,
  gitUnstage,
  gitStageFile,
  gitCommit,
  gitMergeContinue,
  gitRebaseContinue,
  getMergeState,
  isDirectCommitBlocked,
  GitCommandError,
  GitPullNotFastForwardError,
} from "@/lib/git";
import { resolveSafePath, PathAccessError } from "@/lib/pathSafety";

async function ensureWorkspaceGitConfig(cwd: string) {
  const global = await getGlobalSettings();
  if (global.gitUsername || global.gitEmail) {
    await applyGitIdentity(cwd, global.gitUsername, global.gitEmail);
  }
}

const REMOTE_GIT_ACTIONS = new Set([
  "fetch",
  "pull",
  "pull-merge",
  "pull-rebase",
  "push",
]);

function isGitAuthFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("authentication failed") ||
    lower.includes("invalid credentials") ||
    lower.includes("could not read username") ||
    lower.includes("repository not found")
  );
}

function gitErrorResponse(err: unknown, fallback: string) {
  if (err instanceof GitPullNotFastForwardError) {
    return NextResponse.json(
      {
        error: err.message,
        code: "PULL_NOT_FAST_FORWARD",
        hint: "Local and remote branches have diverged. Choose merge or rebase.",
      },
      { status: 409 }
    );
  }
  if (err instanceof GitCommandError) {
    if (isGitAuthFailure(err.message)) {
      return NextResponse.json(
        {
          error: err.message,
          code: "GITHUB_AUTH_FAILED",
          hint: "GitHub rejected the stored credentials. Sign in to GitHub again in Setup and confirm your account can access this repository.",
        },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof PathAccessError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  const msg = err instanceof Error ? err.message : fallback;
  console.error(`[git] ${fallback}:`, err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

async function syncResponse(cwd: string, defaultBranch: string) {
  const sync = await getSyncStatus(cwd, defaultBranch);
  const mergeState = await getMergeState(cwd);
  return { success: true, sync, mergeState };
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
      const mergeState = await getMergeState(cwd);
      return NextResponse.json({
        sync,
        branchProtected: isDirectCommitBlocked(profile, current),
        autoFetchEnabled: profile.autoFetch !== false && intervalMinutes > 0,
        autoFetchIntervalMinutes: intervalMinutes,
        mergeState,
      });
    }

    if (action === "working-status") {
      const files = await gitWorkingStatus(cwd);
      const mergeState = await getMergeState(cwd);
      return NextResponse.json({ files, mergeState });
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
      const fullPath = await resolveSafePath(cwd, file);
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
  const token = profile.gitToken || (await getGithubToken()) || undefined;

  try {
    const body = await request.json();
    const { action, branch, files, file, message, amend, strategy } = body;

    if (REMOTE_GIT_ACTIONS.has(action) && !token) {
      return NextResponse.json(
        {
          error: "No GitHub token configured for this profile.",
          code: "GITHUB_AUTH_REQUIRED",
          hint: "Sign in to GitHub again in Setup to store credentials for push and pull.",
        },
        { status: 401 }
      );
    }

    if (action === "fetch") {
      await gitFetch(cwd, token);
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
    }

    if (action === "pull") {
      await gitPull(cwd, token);
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
    }

    if (action === "pull-merge") {
      await gitPullMerge(cwd, token);
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
    }

    if (action === "pull-rebase") {
      await gitPullRebase(cwd, token);
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
    }

    if (action === "push") {
      const current = await getCurrentBranch(cwd);
      if (isDirectCommitBlocked(profile, current)) {
        return NextResponse.json(
          { error: "Push to protected branch is disabled by branch protection." },
          { status: 403 }
        );
      }
      await gitPush(cwd, token);
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
    }

    if (action === "stage") {
      if (!Array.isArray(files) || files.length === 0) {
        return NextResponse.json({ error: "Files array required" }, { status: 400 });
      }
      await gitStage(cwd, files);
      const workingFiles = await gitWorkingStatus(cwd);
      return NextResponse.json({ success: true, files: workingFiles });
    }

    if (action === "unstage") {
      if (!Array.isArray(files) || files.length === 0) {
        return NextResponse.json({ error: "Files array required" }, { status: 400 });
      }
      await gitUnstage(cwd, files);
      const workingFiles = await gitWorkingStatus(cwd);
      return NextResponse.json({ success: true, files: workingFiles });
    }

    if (action === "stage-file") {
      if (!file || typeof file !== "string") {
        return NextResponse.json({ error: "File parameter missing" }, { status: 400 });
      }
      await gitStageFile(cwd, file);
      const workingFiles = await gitWorkingStatus(cwd);
      const mergeState = await getMergeState(cwd);
      return NextResponse.json({ success: true, files: workingFiles, mergeState });
    }

    if (action === "commit") {
      const current = await getCurrentBranch(cwd);
      if (isDirectCommitBlocked(profile, current)) {
        return NextResponse.json(
          { error: "Direct commits to protected branches are disabled by branch protection." },
          { status: 403 }
        );
      }
      if (!message || typeof message !== "string" || !message.trim()) {
        return NextResponse.json({ error: "Commit message required" }, { status: 400 });
      }
      await ensureWorkspaceGitConfig(cwd);
      await gitCommit(cwd, message.trim(), strategy === "amend" || amend === true);
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
    }

    if (action === "merge-continue") {
      const mergeState = await getMergeState(cwd);
      if (mergeState === "rebase") {
        await gitRebaseContinue(cwd);
      } else if (mergeState === "merge") {
        await gitMergeContinue(cwd);
      } else {
        return NextResponse.json({ error: "No merge or rebase in progress" }, { status: 400 });
      }
      return NextResponse.json(await syncResponse(cwd, global.defaultBranch));
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
