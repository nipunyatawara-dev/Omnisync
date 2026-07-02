import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { resolveSafePath, PathAccessError } from "@/lib/pathSafety";

describe("resolveSafePath", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-ws-"));
    await fs.writeFile(path.join(workspace, "safe.txt"), "ok", "utf-8");
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("resolves files inside workspace", async () => {
    const resolved = await resolveSafePath(workspace, "safe.txt");
    expect(resolved).toContain("safe.txt");
  });

  it("rejects path traversal", async () => {
    await expect(resolveSafePath(workspace, "../outside.txt")).rejects.toBeInstanceOf(PathAccessError);
  });

  it("rejects symlink escape on existing files", async () => {
    if (process.platform === "win32") return;
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-out-"));
    await fs.writeFile(path.join(outside, "secret.txt"), "secret", "utf-8");
    await fs.symlink(path.join(outside, "secret.txt"), path.join(workspace, "link.txt"));
    await expect(resolveSafePath(workspace, "link.txt")).rejects.toBeInstanceOf(PathAccessError);
    await fs.rm(outside, { recursive: true, force: true });
  });
});
