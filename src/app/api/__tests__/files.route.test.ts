import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

describe("GET /api/workspace/files lazy listing", () => {
  let tmpDir: string;
  let workspace: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-files-"));
    workspace = path.join(tmpDir, "workspace");
    await fs.mkdir(path.join(workspace, "src"), { recursive: true });
    await fs.writeFile(path.join(workspace, "readme.md"), "hi");
    await fs.writeFile(path.join(workspace, "src", "index.ts"), "export {};");
    process.env.OMNISYNC_USER_DATA_DIR = path.join(tmpDir, "userdata");
    process.env.OMNISYNC_ENCRYPTION_SECRET = "test-secret-for-files-route-32chars!!";
    vi.resetModules();

    const { createProfile } = await import("@/lib/profiles");
    await createProfile({
      name: "Files Test",
      profession: "Developer",
      workspacePath: workspace,
    });
  });

  afterEach(async () => {
    delete process.env.OMNISYNC_USER_DATA_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("lists only the root directory by default", async () => {
    const { GET } = await import("@/app/api/workspace/files/route");
    const res = await GET(new Request("http://localhost:47821/api/workspace/files"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "readme.md", isDirectory: false }),
        expect.objectContaining({ name: "src", isDirectory: true }),
      ])
    );
    const src = data.children.find((n: { name: string }) => n.name === "src");
    expect(src.children).toBeUndefined();
    expect(data.children.every((n: { absolutePath?: string }) => !n.absolutePath)).toBe(true);
  });

  it("lists a subdirectory when path is provided", async () => {
    const { GET } = await import("@/app/api/workspace/files/route");
    const res = await GET(
      new Request("http://localhost:47821/api/workspace/files?path=src")
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.children).toEqual([
      expect.objectContaining({ name: "index.ts", relativePath: "src/index.ts" }),
    ]);
  });
});
