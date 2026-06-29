import { execSync } from "child_process";
import fs from "fs";

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

// Helper to run commands
function runGit(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    // If command errors out, return empty string
    return "";
  }
}

// Get current active branch
export function getCurrentBranch(cwd: string): string {
  const branch = runGit("git branch --show-current", cwd);
  return branch || "main";
}

// List all local branches
export function getBranches(cwd: string): string[] {
  const output = runGit("git branch --format='%(refname:short)'", cwd);
  if (!output) return ["main"];
  return output.split("\n").map(b => b.trim()).filter(Boolean);
}

// Get synchronization status relative to upstream
export function getSyncStatus(cwd: string): { ahead: number; behind: number; upstream: string } {
  const currentBranch = getCurrentBranch(cwd);
  const statusLine = runGit(`git status -sb`, cwd);
  
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

  return { ahead, behind, upstream: upstream || `origin/${currentBranch}` };
}

// Get timeline of recent git commits for a specific file
export function getFileCommits(cwd: string, relativeFilePath: string): GitCommit[] {
  if (!relativeFilePath) return [];
  const cmd = `git log --follow --pretty=format:"%H|%an|%ad|%s" -n 25 -- "${relativeFilePath}"`;
  const output = runGit(cmd, cwd);
  if (!output) return [];

  return output.split("\n").map((line) => {
    const [hash, author, date, subject] = line.split("|");
    return { hash, author, date, subject };
  });
}

// Get line-by-line diff for a commit and file
export function getCommitDiff(cwd: string, commitHash: string, relativeFilePath: string): DiffLine[] {
  if (!commitHash || !relativeFilePath) return [];
  
  const cmd = `git show ${commitHash} --unified=3 --pretty=format:"" -- "${relativeFilePath}"`;
  const diffOutput = runGit(cmd, cwd);
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
export function getConflictFiles(cwd: string): string[] {
  const output = runGit("git diff --name-only --diff-filter=U", cwd);
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

export function parseConflictFile(filePath: string): { 
  hasConflicts: boolean;
  blocks: ConflictBlock[];
  rawLines: string[];
} {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const blocks: ConflictBlock[] = [];
    const rawLines: string[] = [];
    
    let isInsideConflict = false;
    let oursBuffer: string[] = [];
    let theirsBuffer: string[] = [];
    let conflictStartIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith("<<<<<<<")) {
        isInsideConflict = true;
        oursBuffer = [];
        theirsBuffer = [];
        conflictStartIndex = i;
      } else if (line.startsWith("=======")) {
        // Transition from ours to theirs
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
          const parentBlockIndex = lines.indexOf("=======", conflictStartIndex);
          if (parentBlockIndex !== -1 && i > parentBlockIndex) {
            theirsBuffer.push(line);
          } else {
            oursBuffer.push(line);
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

export function getAllRepoCommits(cwd: string): RepoCommit[] {
  const cmd = `git log --all --pretty=format:"%H|%an|%ad|%s|%P" --date=format:"%Y-%m-%d"`;
  const output = runGit(cmd, cwd);
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
