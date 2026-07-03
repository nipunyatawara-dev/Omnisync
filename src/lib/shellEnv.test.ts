import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";

const shellEnvPath = path.join(process.cwd(), "shellEnv.js");
const requireShellEnv = createRequire(path.join(process.cwd(), "package.json"));
const { augmentProcessEnv, getLoginShellPath, resolveCommand } = requireShellEnv(shellEnvPath);

describe("shellEnv", () => {
  it("augments PATH with login shell entries", () => {
    const env = augmentProcessEnv({ FOO: "bar" });
    expect(env.FOO).toBe("bar");
    expect(env.PATH).toBeTruthy();
    expect(typeof env.PATH).toBe("string");
    expect(env.PATH!.length).toBeGreaterThan(0);
    expect(env.npm_config_prefix).toBeUndefined();
  });

  it("returns a stable cached login shell PATH", () => {
    const first = getLoginShellPath();
    const second = getLoginShellPath();
    expect(second).toBe(first);
  });

  it("resolves npm to an absolute path", () => {
    const npmPath = resolveCommand("npm");
    expect(npmPath).toMatch(/npm$/);
    expect(npmPath.startsWith("/")).toBe(true);
  });
});

describe("shellEnv against a login shell that leaks OSC shell-integration noise", () => {
  const originalShell = process.env.SHELL;
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
    delete requireShellEnv.cache[shellEnvPath];
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("still resolves a clean npm path and PATH when the shell prints OSC junk before its real output", async () => {
    // Reproduces iTerm2/VS Code/Cursor shell-integration scripts that get sourced by
    // `-ilc` and print OSC 1337 escape sequences to stdout with no separating newline,
    // exactly like the "npm ci ... zsh: no such file or directory: ^[]1337;..." failure.
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-fakeshell-"));
    const fakeShellPath = path.join(tmpDir, "fake-shell.sh");
    const ESC = "\x1b";
    const BEL = "\x07";
    const oscJunk =
      `${ESC}]1337;RemoteHost=test@host${BEL}` +
      `${ESC}]1337;CurrentDir=/fake/app.asar.unpacked/.next/standalone${BEL}` +
      `${ESC}]1337;ShellIntegrationVersion=14;shell=zsh${BEL}`;
    const script =
      "#!/bin/sh\n" +
      `printf '%s' '${oscJunk}'\n` +
      'if [ "$1" = "-ilc" ]; then eval "$2"; else eval "$1"; fi\n';

    await fs.writeFile(fakeShellPath, script);
    await fs.chmod(fakeShellPath, 0o755);
    process.env.SHELL = fakeShellPath;
    delete requireShellEnv.cache[shellEnvPath];

    const fresh = requireShellEnv(shellEnvPath);

    const pathValue: string = fresh.getLoginShellPath();
    expect(pathValue).not.toMatch(/\x1b/);
    expect(pathValue.split(":").every((part) => part.startsWith("/"))).toBe(true);

    const npmPath: string = fresh.resolveCommand("npm");
    expect(npmPath).not.toMatch(/\x1b/);
    expect(npmPath.startsWith("/")).toBe(true);
    expect(npmPath.endsWith("npm")).toBe(true);
  });
});
