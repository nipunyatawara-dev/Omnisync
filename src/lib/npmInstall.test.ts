import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { resetBrokenEsbuildInstall, npmInstallArgs } from "@/lib/npmInstall";

describe("npmInstall", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-npm-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("adds include=optional to install args", () => {
    expect(npmInstallArgs()).toEqual(["install", "--include=optional"]);
    expect(npmInstallArgs(["cache", "clean", "--force"])).toEqual([
      "cache",
      "clean",
      "--force",
      "--include=optional",
    ]);
  });

  it("resets esbuild when @esbuild platform packages are missing", async () => {
    const esbuildDir = path.join(tmpDir, "node_modules", "esbuild", "bin");
    await fs.mkdir(esbuildDir, { recursive: true });
    await fs.writeFile(path.join(esbuildDir, "esbuild"), "#!/usr/bin/env node\n", "utf-8");

    const message = await resetBrokenEsbuildInstall(tmpDir);
    expect(message).toContain("@esbuild platform packages");
    expect(await pathExists(path.join(tmpDir, "node_modules", "esbuild"))).toBe(false);
  });

  it("leaves esbuild alone when platform packages exist", async () => {
    const esbuildBin = path.join(tmpDir, "node_modules", "esbuild", "bin", "esbuild");
    const scopeBin = path.join(tmpDir, "node_modules", "@esbuild", "darwin-arm64", "bin", "esbuild");
    await fs.mkdir(path.dirname(esbuildBin), { recursive: true });
    await fs.mkdir(path.dirname(scopeBin), { recursive: true });
    await fs.writeFile(esbuildBin, "native", "utf-8");
    await fs.writeFile(scopeBin, "native", "utf-8");

    const message = await resetBrokenEsbuildInstall(tmpDir);
    expect(message).toBeNull();
    expect(await pathExists(esbuildBin)).toBe(true);
  });
});

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
