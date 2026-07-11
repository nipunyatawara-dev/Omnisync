import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
  resetBrokenEsbuildInstall,
  npmInstallArgs,
  resolveDependencyInstallArgs,
  isNativeExecutable,
  sanitizeNpmInstallLogLine,
  stripTerminalEscapeSequences,
} from "@/lib/npmInstall";

describe("npmInstall", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-npm-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("uses plain npm install args (manual Terminal workflow)", () => {
    expect(npmInstallArgs()).toEqual(["install"]);
    expect(npmInstallArgs(["cache", "clean", "--force"])).toEqual([
      "cache",
      "clean",
      "--force",
    ]);
  });

  it("resolves to npm install even when a lockfile exists", async () => {
    await fs.writeFile(path.join(tmpDir, "package-lock.json"), "{}", "utf-8");
    expect(await resolveDependencyInstallArgs(tmpDir)).toEqual(["install"]);
  });

  it("falls back to npm install without a lockfile", async () => {
    expect(await resolveDependencyInstallArgs(tmpDir)).toEqual(["install"]);
  });

  it("resets esbuild when @esbuild platform packages are missing", async () => {
    const esbuildDir = path.join(tmpDir, "node_modules", "esbuild", "bin");
    await fs.mkdir(esbuildDir, { recursive: true });
    await fs.writeFile(path.join(esbuildDir, "esbuild"), "#!/usr/bin/env node\n", "utf-8");

    const message = await resetBrokenEsbuildInstall(tmpDir);
    expect(message).toContain("@esbuild platform packages");
    expect(await pathExists(path.join(tmpDir, "node_modules", "esbuild"))).toBe(false);
  });

  it("leaves esbuild alone when platform packages exist and bin is still a JS stub", async () => {
    const esbuildBin = path.join(tmpDir, "node_modules", "esbuild", "bin", "esbuild");
    const scopeBin = path.join(tmpDir, "node_modules", "@esbuild", "darwin-arm64", "bin", "esbuild");
    await fs.mkdir(path.dirname(esbuildBin), { recursive: true });
    await fs.mkdir(path.dirname(scopeBin), { recursive: true });
    await fs.writeFile(esbuildBin, "#!/usr/bin/env node\n", "utf-8");
    await fs.writeFile(scopeBin, "native", "utf-8");

    const message = await resetBrokenEsbuildInstall(tmpDir);
    expect(message).toBeNull();
    expect(await pathExists(esbuildBin)).toBe(true);
  });

  it("resets esbuild when bin is a native binary even if @esbuild exists", async () => {
    const esbuildBin = path.join(tmpDir, "node_modules", "esbuild", "bin", "esbuild");
    const scopeBin = path.join(tmpDir, "node_modules", "@esbuild", "darwin-arm64", "bin", "esbuild");
    await fs.mkdir(path.dirname(esbuildBin), { recursive: true });
    await fs.mkdir(path.dirname(scopeBin), { recursive: true });
    await fs.writeFile(esbuildBin, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00]));
    await fs.writeFile(scopeBin, "native", "utf-8");

    const message = await resetBrokenEsbuildInstall(tmpDir);
    expect(message).toContain("stale esbuild binary");
    expect(await pathExists(path.join(tmpDir, "node_modules", "esbuild"))).toBe(false);
  });

  it("detects native executables by magic bytes", async () => {
    const binPath = path.join(tmpDir, "macho");
    await fs.writeFile(binPath, Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
    expect(await isNativeExecutable(binPath)).toBe(true);

    const jsPath = path.join(tmpDir, "js");
    await fs.writeFile(jsPath, "#!/usr/bin/env node\n", "utf-8");
    expect(await isNativeExecutable(jsPath)).toBe(false);
  });

  it("sanitizes npm buffer dump lines from install logs", () => {
    expect(sanitizeNpmInstallLogLine("npm error Buffer(677) [Uint8Array] [")).toBeNull();
    expect(sanitizeNpmInstallLogLine("npm error 58, 49, 10, 239, 191, 189,")).toBeNull();
    expect(
      sanitizeNpmInstallLogLine("npm error SyntaxError: Invalid or unexpected token")
    ).toContain("esbuild postinstall failed");
  });

  it("strips iTerm2/VS Code shell-integration OSC sequences from process output", () => {
    const polluted =
      "zsh:1: no such file or directory: \x1b]1337;RemoteHost=user@Mac.local\x07" +
      "\x1b]1337;CurrentDir=/Applications/OmniSync.app/Contents/Resources/app.asar.unpacked/.next/standalone\x07" +
      "\x1b]1337;ShellIntegrationVersion=14;shell=zsh\x07/Users/user/.local/bin/npm";

    expect(stripTerminalEscapeSequences(polluted)).toBe(
      "zsh:1: no such file or directory: /Users/user/.local/bin/npm"
    );
  });

  it("strips CSI color/cursor escape codes alongside OSC sequences", () => {
    const colored = "\x1b[32minstalled\x1b[0m 42 packages";
    expect(stripTerminalEscapeSequences(colored)).toBe("installed 42 packages");
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
