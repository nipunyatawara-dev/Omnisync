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

function gitAuthArgs(token?: string): string[] {
  if (!token) return [];
  // Prefer URL rewrite over Bearer headers — more reliable for HTTPS remotes in
  // GUI apps (no TTY). Disable credential helpers so keychain cannot override.
  return [
    "-c",
    "credential.helper=",
    "-c",
    `url.https://x-access-token:${token}@github.com/.insteadOf=https://github.com/`,
  ];
}

function gitChildEnv(): NodeJS.ProcessEnv {
  return {
    ...augmentProcessEnv(),
    // Never prompt for username/password — that yields "Device not configured" in Electron.
    GIT_TERMINAL_PROMPT: "0",
  };
}

function execGit(args: string[], cwd: string, token?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [...gitAuthArgs(token), ...args],
      { cwd, encoding: "utf-8", timeout: 120000, env: gitChildEnv() },
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

// Helper to run read-only git commands; rejects on failure.
// Default buffer is enough for status/branch lists; pass a larger maxBuffer for full diffs.
function runGit(
  args: string[],
  cwd: string,
  options: { maxBuffer?: number } = {}
): Promise<string> {
  const maxBuffer = options.maxBuffer ?? 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, encoding: "utf-8", timeout: 20000, maxBuffer, env: augmentProcessEnv() },
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

/** Short name from a remote-tracking ref (`origin/dev` → `dev`). Skips remote HEAD. */
export function shortNameFromRemoteRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed || trimmed.includes("->") || trimmed.endsWith("/HEAD")) return null;
  const slash = trimmed.indexOf("/");
  if (slash < 0) return null;
  const short = trimmed.slice(slash + 1);
  return short || null;
}

/** Local branches only (`refs/heads/*`). */
export async function getLocalBranches(cwd: string): Promise<string[]> {
  const output = await runGit(["branch", "--format=%(refname:short)"], cwd);
  if (!output) return [];
  return output.split("\n").map((b) => b.trim()).filter(Boolean);
}

/**
 * Local branch names plus remote-tracking branches as short names (deduped).
 * After a normal clone this includes remote-only branches like `dev` from `origin/dev`.
 */
export async function getBranches(cwd: string): Promise<string[]> {
  const names = new Set<string>(await getLocalBranches(cwd));

  try {
    const remote = await runGit(
      ["for-each-ref", "--format=%(refname:short)", "refs/remotes/"],
      cwd
    );
    for (const line of (remote || "").split("\n")) {
      const short = shortNameFromRemoteRef(line);
      if (short) names.add(short);
    }
  } catch {
    // No remotes yet — local list is enough.
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Map a short branch name to a git ref. Prefers the local branch, then `origin/<name>`,
 * then any other remote-tracking match.
 */
export async function resolveBranchRef(cwd: string, branch: string): Promise<string | null> {
  if (!branch) return null;
  const local = await getLocalBranches(cwd);
  if (local.includes(branch)) return branch;

  try {
    const remote = await runGit(
      ["for-each-ref", "--format=%(refname:short)", "refs/remotes/"],
      cwd
    );
    const matches = (remote || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => shortNameFromRemoteRef(l) === branch);
    return matches.find((m) => m.startsWith("origin/")) || matches[0] || null;
  } catch {
    return null;
  }
}

/** Checkout a local branch, or create a local tracking branch from a remote-only ref. */
export async function checkoutBranch(cwd: string, branch: string): Promise<void> {
  const local = await getLocalBranches(cwd);
  if (local.includes(branch)) {
    await execGit(["checkout", branch], cwd);
    return;
  }

  const remoteRef = await resolveBranchRef(cwd, branch);
  if (!remoteRef || remoteRef === branch) {
    throw new GitCommandError(`Unknown branch '${branch}'`);
  }

  await execGit(["checkout", "-b", branch, "--track", remoteRef], cwd);
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
    cwd,
    { maxBuffer: 16 * 1024 * 1024 }
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
  email: string;
  date: string;
  authoredAt: string;
  subject: string;
  isMerge: boolean;
  branches: string[];
}

export interface MergePreviewResult {
  clean: boolean;
  conflicts: string[];
  message?: string;
}

export interface MergeBranchesResult {
  status: "ok" | "conflicts" | "error";
  conflicts: string[];
  currentBranch: string;
  message?: string;
}

/** Extract branch names from git log %D decorate string (local + remote short names). */
export function parseDecorateBranches(decorate: string): string[] {
  if (!decorate.trim()) return [];
  const names = new Set<string>();
  for (const raw of decorate.split(",")) {
    let part = raw.trim();
    if (!part || part.startsWith("tag:")) continue;
    if (part.startsWith("HEAD -> ")) part = part.slice("HEAD -> ".length).trim();
    if (part.startsWith("refs/heads/")) part = part.slice("refs/heads/".length);
    if (part.startsWith("refs/remotes/")) {
      part = part.slice("refs/remotes/".length);
      const short = shortNameFromRemoteRef(part);
      if (short) part = short;
      else continue;
    } else if (part.startsWith("origin/")) {
      const short = shortNameFromRemoteRef(part);
      if (short) part = short;
      else continue;
    }
    if (part && part !== "HEAD") names.add(part);
  }
  return [...names];
}

function parseRepoCommitLine(line: string): RepoCommit | null {
  if (!line.trim()) return null;
  // hash|author|email|date|authoredAt|subject|decorate|parents
  // subject may contain | — take fixed head/tail fields
  const parts = line.split("|");
  if (parts.length < 8) {
    // Backward-compatible: older 5-field format without email
    if (parts.length >= 5) {
      const hash = parts[0] || "";
      const author = parts[1] || "";
      const date = parts[2] || "";
      const subject = parts.slice(3, -1).join("|") || "";
      const parents = parts[parts.length - 1] || "";
      return {
        hash,
        author,
        email: "",
        date,
        authoredAt: date,
        subject,
        isMerge: parents.trim().split(/\s+/).filter(Boolean).length > 1,
        branches: [],
      };
    }
    return null;
  }
  const hash = parts[0] || "";
  const author = parts[1] || "";
  const email = parts[2] || "";
  const date = parts[3] || "";
  const authoredAt = parts[4] || date;
  const parents = parts[parts.length - 1] || "";
  const decorate = parts[parts.length - 2] || "";
  const subject = parts.slice(5, -2).join("|") || "";
  return {
    hash,
    author,
    email,
    date,
    authoredAt,
    subject,
    isMerge: parents.trim().split(/\s+/).filter(Boolean).length > 1,
    branches: parseDecorateBranches(decorate),
  };
}

/**
 * Repo-wide commit log. Pass branch names to limit history; omit / empty = all branches
 * (local + remote-tracking, resolved to usable refs).
 */
export async function getAllRepoCommits(
  cwd: string,
  branches?: string[]
): Promise<RepoCommit[]> {
  const names =
    branches && branches.length > 0
      ? branches
      : await getBranches(cwd);

  const refs: string[] = [];
  for (const name of names) {
    const ref = await resolveBranchRef(cwd, name);
    if (ref) refs.push(ref);
  }

  if (refs.length === 0) return [];

  const output = await runGit(
    [
      "log",
      ...refs,
      "--pretty=format:%H|%an|%ae|%ad|%aI|%s|%D|%P",
      "--date=format:%Y-%m-%d",
    ],
    cwd,
    { maxBuffer: 8 * 1024 * 1024 }
  );
  if (!output) return [];

  const seen = new Set<string>();
  const commits: RepoCommit[] = [];
  for (const line of output.split("\n")) {
    const commit = parseRepoCommitLine(line);
    if (!commit || seen.has(commit.hash)) continue;
    seen.add(commit.hash);
    commits.push(commit);
  }
  return commits;
}

async function assertCleanWorktree(cwd: string): Promise<void> {
  const status = await runGit(["status", "--porcelain=v1"], cwd);
  if (status.trim()) {
    throw new GitCommandError(
      "Working tree has uncommitted changes. Commit or stash them before merging branches."
    );
  }
}

/**
 * Read-only merge conflict preview (does not leave the repo mid-merge).
 */
export async function previewMerge(
  cwd: string,
  source: string,
  target: string
): Promise<MergePreviewResult> {
  if (!source || !target) {
    return { clean: false, conflicts: [], message: "Source and target branches are required." };
  }
  if (source === target) {
    return { clean: false, conflicts: [], message: "Choose two different branches." };
  }

  const sourceRef = await resolveBranchRef(cwd, source);
  const targetRef = await resolveBranchRef(cwd, target);
  if (!sourceRef || !targetRef) {
    return { clean: false, conflicts: [], message: "Unknown branch selected." };
  }

  try {
    // Modern merge-tree: exit 0 clean, exit 1 conflicts; --name-only lists conflict paths.
    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        ["merge-tree", "--write-tree", "--name-only", targetRef, sourceRef],
        { cwd, encoding: "utf-8", timeout: 30000, maxBuffer: 4 * 1024 * 1024, env: augmentProcessEnv() },
        (error, stdout, stderr) => {
          const text = `${stdout || ""}\n${stderr || ""}`.trim();
          if (error) {
            const code = typeof error === "object" && error && "code" in error ? (error as { code?: number }).code : undefined;
            if (code === 1) {
              resolve(text);
              return;
            }
            reject(new GitCommandError((stderr || error.message || "merge-tree failed").trim(), stderr?.trim() || ""));
            return;
          }
          resolve(text);
        }
      );
    });

    // On success, first line is the result tree OID; remaining lines (if any) are conflict paths.
    const lines = output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^[0-9a-f]{40,}$/i.test(l));

    const conflicts = [...new Set(lines)];
    if (conflicts.length === 0) {
      return { clean: true, conflicts: [] };
    }
    return { clean: false, conflicts };
  } catch (err) {
    // Fallback: classic merge-tree via merge-base
    try {
      const base = await runGit(["merge-base", targetRef, sourceRef], cwd);
      const treeOut = await runGit(["merge-tree", base, targetRef, sourceRef], cwd, {
        maxBuffer: 4 * 1024 * 1024,
      });
      const conflictFiles = new Set<string>();
      let currentFile = "";
      for (const line of treeOut.split("\n")) {
        const changed = line.match(/^changed in both\s+(.+)$/i);
        if (changed) {
          currentFile = changed[1].trim();
          continue;
        }
        const merged = line.match(/^merged\s+(.+)$/i);
        if (merged) {
          currentFile = merged[1].trim();
          continue;
        }
        if (
          currentFile &&
          (line.startsWith("<<<<<<<") || line.includes("conflict"))
        ) {
          conflictFiles.add(currentFile);
        }
      }
      // Also detect conflict markers anywhere
      if (treeOut.includes("<<<<<<<")) {
        const markerFiles = treeOut.match(/(?:^|\n)(?:changed in both|merged)\s+(.+)/gi) || [];
        for (const m of markerFiles) {
          const name = m.replace(/^(?:changed in both|merged)\s+/i, "").trim();
          if (name) conflictFiles.add(name);
        }
      }
      const conflicts = [...conflictFiles];
      return {
        clean: conflicts.length === 0 && !treeOut.includes("<<<<<<<"),
        conflicts,
      };
    } catch (fallbackErr) {
      const msg =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : err instanceof Error
            ? err.message
            : "Could not preview merge";
      return { clean: false, conflicts: [], message: msg };
    }
  }
}

/**
 * Checkout target and merge source into it.
 */
export async function mergeBranches(
  cwd: string,
  source: string,
  target: string
): Promise<MergeBranchesResult> {
  if (!source || !target || source === target) {
    return {
      status: "error",
      conflicts: [],
      currentBranch: await getCurrentBranch(cwd),
      message: "Choose two different branches to merge.",
    };
  }

  const sourceRef = await resolveBranchRef(cwd, source);
  const targetRef = await resolveBranchRef(cwd, target);
  if (!sourceRef || !targetRef) {
    return {
      status: "error",
      conflicts: [],
      currentBranch: await getCurrentBranch(cwd),
      message: "Unknown branch selected.",
    };
  }

  await assertCleanWorktree(cwd);

  const current = await getCurrentBranch(cwd);
  if (current !== target) {
    await checkoutBranch(cwd, target);
  }

  try {
    await execGit(["merge", "--no-edit", sourceRef], cwd);
    return {
      status: "ok",
      conflicts: [],
      currentBranch: await getCurrentBranch(cwd),
    };
  } catch (err) {
    const conflicts = await getConflictFiles(cwd);
    if (conflicts.length > 0) {
      return {
        status: "conflicts",
        conflicts,
        currentBranch: await getCurrentBranch(cwd),
        message: "Merge has conflicts. Resolve them, then complete the merge.",
      };
    }
    const message = err instanceof Error ? err.message : "Merge failed";
    return {
      status: "error",
      conflicts: [],
      currentBranch: await getCurrentBranch(cwd),
      message,
    };
  }
}

