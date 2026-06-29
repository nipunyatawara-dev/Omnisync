import { NextResponse } from "next/server";
import { getActiveProfile } from "@/lib/profiles";
import { execSync } from "child_process";
import {
  getCurrentBranch,
  getBranches,
  getSyncStatus,
  getFileCommits,
  getCommitDiff,
  getConflictFiles,
  parseConflictFile,
  getAllRepoCommits,
} from "@/lib/git";
import path from "path";

export async function GET(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    if (action === "all-commits") {
      const commits = getAllRepoCommits(cwd);
      return NextResponse.json({ commits });
    }

    if (action === "branches") {
      const branches = getBranches(cwd);
      const current = getCurrentBranch(cwd);
      return NextResponse.json({ branches, current });
    }

    if (action === "status") {
      const sync = getSyncStatus(cwd);
      return NextResponse.json({ sync });
    }

    if (action === "commits") {
      const file = searchParams.get("file");
      if (!file) return NextResponse.json({ error: "File parameter missing" }, { status: 400 });
      const commits = getFileCommits(cwd, file);
      return NextResponse.json({ commits });
    }

    if (action === "diff") {
      const commit = searchParams.get("commit");
      const file = searchParams.get("file");
      if (!commit || !file) {
        return NextResponse.json({ error: "Commit or file parameter missing" }, { status: 400 });
      }
      const diff = getCommitDiff(cwd, commit, file);
      return NextResponse.json({ diff });
    }

    if (action === "conflicts") {
      const conflicts = getConflictFiles(cwd);
      return NextResponse.json({ conflicts });
    }

    if (action === "conflict-details") {
      const file = searchParams.get("file");
      if (!file) return NextResponse.json({ error: "File parameter missing" }, { status: 400 });
      const fullPath = path.join(cwd, file);
      const details = parseConflictFile(fullPath);
      return NextResponse.json(details);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;

  try {
    const { action, branch } = await request.json();

    if (action === "switch-branch") {
      if (!branch) return NextResponse.json({ error: "Branch parameter missing" }, { status: 400 });
      execSync(`git checkout ${branch}`, { cwd });
      return NextResponse.json({ success: true, current: getCurrentBranch(cwd) });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
