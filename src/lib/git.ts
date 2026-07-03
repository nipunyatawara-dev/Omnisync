import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import type { UserProfile } from "@/lib/profiles";
import { augmentProcessEnv } from "@/lib/shellEnv";

const DEFAULT_PROTECTED_BRANCHES = new Set(["main", "master"]);

export function isProtectedBranch(
  branch: string,
  extraProtected: string[] = []
): boolean {
  const normalized = branch.toLowerCase();
  if (DEFAULT_PROTECTED_BRANCHES.has(normalized)) return true;
  return extraProtected.some((b) => b.toLowerCase() === normalized);
}

export function isDirectCommitBlocked(profile: UserProfile | null, branch: string): boolean {
  if (!profile?.branchProtection) return false;
  return isProtectedBranch(branch, profile.protectedBranches ?? []);
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface DiffLine {
  type: "added" | "removed" | "normal";
  content: string;
  lineNumber?: number;
}

export class GitCommandError extends Error {
  stderr: string;

  constructor(message: string, stderr = "") {
    super(message);
    this.name = "GitCommandError";
    this.stderr = stderr;
  }
}

function execGit(args: string[], cwd: string, token?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Disable OS credential helpers so stale keychain entries cannot override
    // the profile OAuth token passed via Authorization header.
    const gitArgs = token
      ? [
          "-c",
          "credential.helper=",
          "-c",
          `http.extraHeader=Authorization: Bearer ${token}`,
          ...args,
        ]
      : args;

    execFile(
      "git",
      gitArgs,
      { cwd, encoding: "utf-8", timeout: 120000, env: augmentProcessEnv() },
      (error, _stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message || `git ${args.join(" ")} failed`).trim();
          reject(new GitCommandError(msg, stderr?.trim() || ""));
          return;
        }
        resolve();
      }
    );
  });
}

/** Apply local git author identity for commits in this workspace */
export async function applyGitIdentity(
  cwd: string,
  name?: string,
  email?: string
): Promise<void> {
  if (name?.trim()) {
    await execGit(["config", "user.name", name.trim()], cwd);
  }
  if (email?.trim()) {
    await execGit(["config", "user.email", email.trim()], cwd);
  }
}

function runGitNoCwd(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { encoding: "utf-8", timeout: 10000, env: augmentProcessEnv() },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message || `git ${args.join(" ")} failed`).trim();
          reject(new GitCommandError(msg, stderr?.trim() || ""));
          return;
        }
        resolve((stdout || "").trim());
      }
    );
  });
}

/** Read a git config value from a repo (local → global) or from global config only. */
export async function readGitConfig(key: string, cwd?: string): Promise<string | null> {
  try {
    if (cwd) {
      const value = await runGit(["config", "--get", key], cwd);
      return value || null;
    }
    const value = await runGitNoCwd(["config", "--global", "--get", key]);
    return value || null;
  } catch {
    return null;
  }
}

export async function resolveGitIdentity(cwd?: string): Promise<{ name: string; email: string }> {
  const [name, email] = await Promise.all([
    readGitConfig("user.name", cwd),
    readGitConfig("user.email", cwd),
  ]);
  return { name: name || "", email: email || "" };
}

export async function gitFetch(cwd: string, token?: string): Promise<void> {
  await execGit(["fetch", "--all", "--prune"], cwd, token);
}

export class GitPullNotFastForwardError extends GitCommandError {
  constructor(message: string, stderr = "") {
    super(message, stderr);
    this.name = "GitPullNotFastForwardError";
  }
}

export async function gitPull(cwd: string, token?: string): Promise<void> {
  const branch = await getCurrentBranch(cwd);
  try {
    await execGit(["pull", "--ff-only", "origin", branch], cwd, token);
  } catch (err) {
    if (err instanceof GitCommandError) {
      const lower = err.message.toLowerCase();
      if (
        lower.includes("not possible to fast-forward") ||
        lower.includes("diverging branches") ||
        lower.includes("non-fast-forward")
      ) {
        throw new GitPullNotFastForwardError(err.message, err.stderr);
      }
    }
    throw err;
  }
}

export async function gitPullMerge(cwd: string, token?: string): Promise<void> {
  const branch = await getCurrentBranch(cwd);
  await execGit(["pull", "--no-rebase", "origin", branch], cwd, token);
}

export async function gitPullRebase(cwd: string, token?: string): Promise<void> {
  const branch = await getCurrentBranch(cwd);
  await execGit(["pull", "--rebase", "origin", branch], cwd, token);
}

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored"
  | "conflicted";

export interface GitWorkingFile {
  path: string;
  status: GitFileStatus;
  staged: boolean;
}

export function parseGitPorcelainLine(line: string): GitWorkingFile | null {
  if (!line.trim()) return null;
  const indexStatus = line[0];
  const workTreeStatus = line[1];
  const filePath = line.slice(3).trim();
  const staged = indexStatus !== " " && indexStatus !== "?";
  const code = staged ? indexStatus : workTreeStatus;

  let status: GitFileStatus = "modified";
  if (code === "?" || code === "!") status = code === "?" ? "untracked" : "ignored";
  else if (code === "A") status = "added";
  else if (code === "D") status = "deleted";
  else if (code === "R") status = "renamed";
  else if (code === "C") status = "copied";
  else if (code === "U" || indexStatus === "U" || workTreeStatus === "U") status = "conflicted";

  return { path: filePath, status, staged };
}

export async function gitWorkingStatus(cwd: string): Promise<GitWorkingFile[]> {
  const output = await runGit(["status", "--porcelain=v1", "-uall"], cwd);
  if (!output) return [];

  const files: GitWorkingFile[] = [];
  for (const line of output.split("\n")) {
    const file = parseGitPorcelainLine(line);
    if (file) files.push(file);
  }
  return files;
}

export async function gitStage(cwd: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await execGit(["add", "--", ...files], cwd);
}

export async function gitUnstage(cwd: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await execGit(["reset", "HEAD", "--", ...files], cwd);
}

export async function gitStageFile(cwd: string, file: string): Promise<void> {
  await execGit(["add", "--", file], cwd);
}

export async function gitCommit(
  cwd: string,
  message: string,
  amend = false
): Promise<void> {
  const args = amend ? ["commit", "--amend", "-m", message] : ["commit", "-m", message];
  await execGit(args, cwd);
}

export type MergeState = "none" | "merge" | "rebase";

export async function getMergeState(cwd: string): Promise<MergeState> {
  try {
    await fs.access(path.join(cwd, ".git", "MERGE_HEAD"));
    return "merge";
  } catch {
    // continue
  }
  for (const marker of ["rebase-merge", "rebase-apply"]) {
    try {
      await fs.access(path.join(cwd, ".git", marker));
      return "rebase";
    } catch {
      // continue
    }
  }
  return "none";
}

export async function gitMergeContinue(cwd: string): Promise<void> {
  await execGit(["merge", "--continue"], cwd);
}

export async function gitRebaseContinue(cwd: string): Promise<void> {
  await execGit(["rebase", "--continue"], cwd);
}

export async function gitPush(cwd: string, token?: string): Promise<void> {
  const branch = await getCurrentBranch(cwd);
  await execGit(["push", "origin", branch], cwd, token);
}

// Helper to run read-only git commands; rejects on failure
function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, encoding: "utf-8", timeout: 20000, maxBuffer: 32 * 1024 * 1024, env: augmentProcessEnv() },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message || `git ${args.join(" ")} failed`).trim();
          console.error(`[git] command failed: git ${args[0]}`, msg);
          reject(new GitCommandError(msg, stderr?.trim() || ""));
          return;
        }
        resolve((stdout || "").trim());
      }
    );
  });
}

export async function getRemoteOriginUrl(cwd: string): Promise<string | null> {
  try {
    const url = await runGit(["remote", "get-url", "origin"], cwd);
    return url || null;
  } catch {
    return null;
  }
}

// Get current active branch
export async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    const branch = await runGit(["branch", "--show-current"], cwd);
    if (branch) return branch;
  } catch {
    // fall through for detached HEAD
  }
  try {
    return await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  } catch {
    throw new GitCommandError("Unable to determine the current branch");
  }
}

// List all local branches
export async function getBranches(cwd: string): Promise<string[]> {
  const output = await runGit(["branch", "--format=%(refname:short)"], cwd);
  if (!output) return [];
  return output.split("\n").map((b) => b.trim()).filter(Boolean);
}

// Get synchronization status relative to upstream
export async function getSyncStatus(
  cwd: string,
  defaultBranch?: string
): Promise<{ ahead: number; behind: number; upstream: string }> {
  const currentBranch = await getCurrentBranch(cwd);
  const statusLine = await runGit(["status", "-sb"], cwd);
  
  let ahead = 0;
  let behind = 0;
  let upstream = "";

  // Parse status line like: ## main...origin/main [ahead 1, behind 2]
  if (statusLine && statusLine.startsWith("##")) {
    const matchUpstream = statusLine.match(/\.\.\.([^\s]+)/);
    if (matchUpstream) {
      upstream = matchUpstream[1];
    }
    const matchAhead = statusLine.match(/ahead\s(\d+)/);
    if (matchAhead) {
      ahead = parseInt(matchAhead[1], 10);
    }
    const matchBehind = statusLine.match(/behind\s(\d+)/);
    if (matchBehind) {
      behind = parseInt(matchBehind[1], 10);
    }
  }

  const fallbackUpstream = defaultBranch
    ? `origin/${defaultBranch}`
    : `origin/${currentBranch}`;

  return { ahead, behind, upstream: upstream || fallbackUpstream };
}

// Get timeline of recent git commits for a specific file
export async function getFileCommits(cwd: string, relativeFilePath: string): Promise<GitCommit[]> {
  if (!relativeFilePath) return [];
  const output = await runGit(
    ["log", "--follow", "--pretty=format:%H|%an|%ad|%s", "-n", "25", "--", relativeFilePath],
    cwd
  );
  if (!output) return [];

  return output.split("\n").map((line) => {
    const [hash, author, date, subject] = line.split("|");
    return { hash, author, date, subject };
  });
}

// Get line-by-line diff for a commit and file
export async function getCommitDiff(cwd: string, commitHash: string, relativeFilePath: string): Promise<DiffLine[]> {
  if (!commitHash || !relativeFilePath) return [];
  
  const diffOutput = await runGit(
    ["show", commitHash, "--unified=3", "--pretty=format:", "--", relativeFilePath],
    cwd
  );
  if (!diffOutput) return [];

  const lines = diffOutput.split("\n");
  const parsedLines: DiffLine[] = [];
  
  let skipHeader = true;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      skipHeader = false;
      continue;
    }
    if (skipHeader) continue;

    if (line.startsWith("+")) {
      parsedLines.push({ type: "added", content: line.slice(1) });
    } else if (line.startsWith("-")) {
      parsedLines.push({ type: "removed", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      parsedLines.push({ type: "normal", content: line.slice(1) });
    } else {
      parsedLines.push({ type: "normal", content: line });
    }
  }

  return parsedLines;
}

// Scan for merge conflicts in the project
export async function getConflictFiles(cwd: string): Promise<string[]> {
  const output = await runGit(["diff", "--name-only", "--diff-filter=U"], cwd);
  if (!output) return [];
  return output.split("\n").map(f => f.trim()).filter(Boolean);
}

// Parse conflict content into 3 streams (Ours, Theirs, Combined)
export interface ConflictBlock {
  id: string;
  ours: string;
  theirs: string;
  original: string; // The whole block including markers
  resolved?: "ours" | "theirs" | "both" | "custom";
}

// Optimized conflict file parser: O(n) linear scan
export async function parseConflictFile(filePath: string): Promise<{ 
  hasConflicts: boolean;
  blocks: ConflictBlock[];
  rawLines: string[];
}> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const blocks: ConflictBlock[] = [];
    const rawLines: string[] = [];
    
    let isInsideConflict = false;
    let isOurs = true;
    let oursBuffer: string[] = [];
    let theirsBuffer: string[] = [];
    let conflictStartIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith("<<<<<<<")) {
        isInsideConflict = true;
        isOurs = true;
        oursBuffer = [];
        theirsBuffer = [];
        conflictStartIndex = i;
      } else if (line.startsWith("=======")) {
        isOurs = false;
      } else if (line.startsWith(">>>>>>>")) {
        isInsideConflict = false;
        const originalBlock = lines.slice(conflictStartIndex, i + 1).join("\n");
        const blockId = `conflict-${conflictStartIndex}`;
        
        blocks.push({
          id: blockId,
          ours: oursBuffer.join("\n"),
          theirs: theirsBuffer.join("\n"),
          original: originalBlock
        });
        
        rawLines.push(`##CONFLICT_BLOCK:${blockId}##`);
      } else {
        if (isInsideConflict) {
          if (isOurs) {
            oursBuffer.push(line);
          } else {
            theirsBuffer.push(line);
          }
        } else {
          rawLines.push(line);
        }
      }
    }
    
    return {
      hasConflicts: blocks.length > 0,
      blocks,
      rawLines
    };
  } catch {
    return { hasConflicts: false, blocks: [], rawLines: [] };
  }
}

export interface RepoCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
  isMerge: boolean;
}

export async function getAllRepoCommits(cwd: string): Promise<RepoCommit[]> {
  const output = await runGit(
    ["log", "--all", "--pretty=format:%H|%an|%ad|%s|%P", "--date=format:%Y-%m-%d"],
    cwd
  );
  if (!output) return [];

  return output.split("\n").map((line) => {
    const parts = line.split("|");
    const hash = parts[0] || "";
    const author = parts[1] || "";
    const date = parts[2] || "";
    const subject = parts[3] || "";
    const parents = parts[4] || "";
    const isMerge = parents.trim().split(/\s+/).length > 1;
    return { hash, author, date, subject, isMerge };
  });
}

