import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import os from "os";
import { resolveWorkspaceCwd } from "@/lib/workspaceAccess";
import * as profiles from "@/lib/profiles";

vi.mock("@/lib/profiles", () => ({
  getProfiles: vi.fn(),
  getActiveProfile: vi.fn(),
}));

describe("resolveWorkspaceCwd", () => {
  const workspaceA = path.join(os.tmpdir(), "omnisync-ws-a");
  const workspaceB = path.join(os.tmpdir(), "omnisync-ws-b");

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses active profile when no path requested", async () => {
    vi.mocked(profiles.getActiveProfile).mockResolvedValue({
      id: "p1",
      name: "Test",
      profession: "dev",
      workspacePath: workspaceA,
      createdAt: "",
      updatedAt: "",
    });

    const result = await resolveWorkspaceCwd();
    expect(result).toEqual({ cwd: workspaceA });
  });

  it("returns 400 when active profile has no workspace", async () => {
    vi.mocked(profiles.getActiveProfile).mockResolvedValue({
      id: "p1",
      name: "Test",
      profession: "dev",
      createdAt: "",
      updatedAt: "",
    });

    const result = await resolveWorkspaceCwd();
    expect(result).toEqual({ error: "No workspace path", status: 400 });
  });

  it("allows exact match against any profile workspace", async () => {
    vi.mocked(profiles.getProfiles).mockResolvedValue([
      {
        id: "p1",
        name: "A",
        profession: "dev",
        workspacePath: workspaceA,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "p2",
        name: "B",
        profession: "dev",
        workspacePath: workspaceB,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const result = await resolveWorkspaceCwd(workspaceB);
    expect(result).toEqual({ cwd: path.resolve(workspaceB) });
  });

  it("rejects paths not in allowlist", async () => {
    vi.mocked(profiles.getProfiles).mockResolvedValue([
      {
        id: "p1",
        name: "A",
        profession: "dev",
        workspacePath: workspaceA,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const result = await resolveWorkspaceCwd("/tmp/arbitrary-path");
    expect(result).toEqual({ error: "Workspace path not in allowlist", status: 403 });
  });
});
