import { describe, it, expect } from "vitest";
import { isProtectedBranch, isDirectCommitBlocked, parseConflictFile, parseGitPorcelainLine } from "@/lib/git";
import type { UserProfile } from "@/lib/profiles";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

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
