import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/workspace/launch/route";
import * as workspaceAccess from "@/lib/workspaceAccess";

vi.mock("@/lib/workspaceAccess", () => ({
  resolveWorkspaceCwd: vi.fn(),
}));

vi.mock("@/lib/platformLaunch", () => ({
  openPath: vi.fn().mockResolvedValue(undefined),
  launchIde: vi.fn().mockResolvedValue(true),
  openUrl: vi.fn().mockResolvedValue(undefined),
  openXcodeProject: vi.fn().mockResolvedValue(undefined),
  runElectronDev: vi.fn(),
}));

vi.mock("@/lib/runner", () => ({
  getRunnerLogs: vi.fn().mockReturnValue([]),
}));

describe("launch route POST", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects non-allowlisted workspace paths", async () => {
    vi.mocked(workspaceAccess.resolveWorkspaceCwd).mockResolvedValue({
      error: "Workspace path not in allowlist",
      status: 403,
    });

    const req = new Request("http://localhost/api/workspace/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "folder", workspacePath: "/tmp/evil" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/allowlist/i);
  });

  it("opens allowlisted folder", async () => {
    vi.mocked(workspaceAccess.resolveWorkspaceCwd).mockResolvedValue({
      cwd: "/allowed/workspace",
    });

    const req = new Request("http://localhost/api/workspace/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "folder", workspacePath: "/allowed/workspace" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
