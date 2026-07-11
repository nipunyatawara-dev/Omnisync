import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

describe("assertAllowedClonePath", () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-home-"));
    vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
    process.env.OMNISYNC_USER_DATA_DIR = path.join(tmpHome, "userdata");
    process.env.OMNISYNC_ENCRYPTION_SECRET = "test-secret-for-clone-path-32chars!";
    vi.resetModules();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.OMNISYNC_USER_DATA_DIR;
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it("allows paths under the home directory", async () => {
    const { assertAllowedClonePath } = await import("@/lib/clonePathSafety");
    const target = path.join(tmpHome, "Documents", "GitHub", "demo");
    await fs.mkdir(path.dirname(target), { recursive: true });
    const result = await assertAllowedClonePath(target);
    expect(result).toContain(tmpHome);
  });

  it("rejects paths outside home when no workspace is registered", async () => {
    const { assertAllowedClonePath } = await import("@/lib/clonePathSafety");
    const outside = path.join(os.tmpdir(), `omnisync-outside-${Date.now()}`, "repo");
    await expect(assertAllowedClonePath(outside)).rejects.toThrow(/home directory/i);
  });
});
