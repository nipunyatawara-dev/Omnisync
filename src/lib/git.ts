import { execFile } from "child_process";
import { promises as fs } from "fs";
import type { UserProfile } from "@/lib/profiles";

const PROTECTED_BRANCHES = new Set(["main", "master"]);

export function isProtectedBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.has(branch.toLowerCase());
}

export function isDirectCommitBlocked(profile: UserProfile | null, branch: string): boolean {
  if (!profile?.branchProtection) return false;
  return isProtectedBranch(branch);
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
    const gitArgs = token
      ? ["-c", `http.extraHeader=Authorization: Bearer ${token}`, ...args]
      : args;

    execFile(
      "git",
      gitArgs,
      { cwd, encoding: "utf-8", timeout: 120000 },
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

export async function gitFetch(cwd: string, token?: string): Promise<void> {
  await execGit(["fetch", "--all", "--prune"], cwd, token);
}

export async function gitPull(cwd: string, token?: string): Promise<void> {
  const branch = await getCurrentBranch(cwd);
  await execGit(["pull", "--ff-only", "origin", branch], cwd, token);
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
      { cwd, encoding: "utf-8", timeout: 20000, maxBuffer: 32 * 1024 * 1024 },
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

