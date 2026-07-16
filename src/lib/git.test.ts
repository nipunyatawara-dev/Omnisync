import { describe, it, expect } from "vitest";
import {
  isProtectedBranch,
  isDirectCommitBlocked,
  parseConflictFile,
  parseGitPorcelainLine,
  getBranches,
  getLocalBranches,
  checkoutBranch,
  getCurrentBranch,
  resolveBranchRef,
  shortNameFromRemoteRef,
} from "@/lib/git";
import type { UserProfile } from "@/lib/profiles";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]) {
  await execFileAsync("git", args, { cwd });
}

describe("git branch protection", () => {
  it("blocks main and master by default", () => {
    expect(isProtectedBranch("main")).toBe(true);
    expect(isProtectedBranch("MASTER")).toBe(true);
    expect(isProtectedBranch("develop")).toBe(false);
  });

  it("respects custom protected branches on profile", () => {
    const profile = {
      branchProtection: true,
      protectedBranches: ["production", "release"],
    } as UserProfile;

    expect(isDirectCommitBlocked(profile, "main")).toBe(true);
    expect(isDirectCommitBlocked(profile, "production")).toBe(true);
    expect(isDirectCommitBlocked(profile, "feature/foo")).toBe(false);
    expect(isDirectCommitBlocked({ branchProtection: false } as UserProfile, "main")).toBe(false);
  });
});

describe("parseGitPorcelainLine", () => {
  it("marks unstaged modifications correctly", () => {
    expect(parseGitPorcelainLine(" M package-lock.json")).toEqual({
      path: "package-lock.json",
      status: "modified",
      staged: false,
    });
  });

  it("marks staged modifications correctly", () => {
    expect(parseGitPorcelainLine("M  package-lock.json")).toEqual({
      path: "package-lock.json",
      status: "modified",
      staged: true,
    });
  });
});

describe("parseDecorateBranches", () => {
  it("extracts local and remote short names, skips tags", async () => {
    const { parseDecorateBranches } = await import("@/lib/git");
    expect(parseDecorateBranches("HEAD -> main, origin/main, tag: v1")).toEqual(["main"]);
    expect(parseDecorateBranches("feature/foo, origin/feature/foo")).toEqual(["feature/foo"]);
    expect(parseDecorateBranches("origin/dev")).toEqual(["dev"]);
    expect(parseDecorateBranches("")).toEqual([]);
  });
});

describe("shortNameFromRemoteRef", () => {
  it("strips remote prefix and skips HEAD", () => {
    expect(shortNameFromRemoteRef("origin/dev")).toBe("dev");
    expect(shortNameFromRemoteRef("origin/feature/foo")).toBe("feature/foo");
    expect(shortNameFromRemoteRef("origin/HEAD")).toBeNull();
    expect(shortNameFromRemoteRef("origin/HEAD -> origin/main")).toBeNull();
  });
});

describe("getBranches includes remote-only branches", () => {
  it("lists origin/dev as dev after a clone that only checked out main", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-branches-"));
    const bare = path.join(root, "remote.git");
    const clone = path.join(root, "clone");

    try {
      await git(root, ["init", "--bare", bare]);

      const seed = path.join(root, "seed");
      await fs.mkdir(seed);
      await git(seed, ["init"]);
      await git(seed, ["config", "user.email", "test@example.com"]);
      await git(seed, ["config", "user.name", "Test"]);
      await git(seed, ["checkout", "-b", "main"]);
      await fs.writeFile(path.join(seed, "README.md"), "main\n", "utf-8");
      await git(seed, ["add", "."]);
      await git(seed, ["commit", "-m", "main"]);
      await git(seed, ["remote", "add", "origin", bare]);
      await git(seed, ["push", "-u", "origin", "main"]);

      await git(seed, ["checkout", "-b", "dev"]);
      await fs.writeFile(path.join(seed, "dev.txt"), "dev\n", "utf-8");
      await git(seed, ["add", "."]);
      await git(seed, ["commit", "-m", "dev"]);
      await git(seed, ["push", "-u", "origin", "dev"]);
      // Bare repos default HEAD to master; point it at main so clone checks out a local branch.
      await git(bare, ["symbolic-ref", "HEAD", "refs/heads/main"]);

      await execFileAsync("git", ["clone", bare, clone]);

      expect(await getLocalBranches(clone)).toEqual(["main"]);
      expect(await getBranches(clone)).toEqual(["dev", "main"]);
      expect(await resolveBranchRef(clone, "dev")).toBe("origin/dev");

      await checkoutBranch(clone, "dev");
      expect(await getCurrentBranch(clone)).toBe("dev");
      expect((await getLocalBranches(clone)).sort()).toEqual(["dev", "main"]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("parseConflictFile", () => {
  it("parses conflict markers into blocks", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-conflict-"));
    const filePath = path.join(dir, "test.txt");
    const content = [
      "line before",
      "<<<<<<< HEAD",
      "ours line",
      "=======",
      "theirs line",
      ">>>>>>> branch",
      "line after",
    ].join("\n");
    await fs.writeFile(filePath, content, "utf-8");

    const result = await parseConflictFile(filePath);
    expect(result.hasConflicts).toBe(true);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].ours).toBe("ours line");
    expect(result.blocks[0].theirs).toBe("theirs line");
    await fs.rm(dir, { recursive: true, force: true });
  });
});
