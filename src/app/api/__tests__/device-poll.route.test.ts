import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

describe("POST /api/auth/device/poll", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-poll-"));
    process.env.OMNISYNC_USER_DATA_DIR = tmpDir;
    process.env.OMNISYNC_ENCRYPTION_SECRET = "test-secret-for-device-poll-32chars!";
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.OMNISYNC_USER_DATA_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("saves the session and does not return the access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return new Response(
            JSON.stringify({ access_token: "gho_secret_should_not_leak" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("api.github.com/user")) {
          return new Response(
            JSON.stringify({ login: "octocat", avatar_url: "https://example.com/a.png" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("not found", { status: 404 });
      })
    );

    vi.doMock("@/lib/githubOAuth", () => ({
      requireGithubClientId: async () => "test-client-id",
    }));

    const { POST } = await import("@/app/api/auth/device/poll/route");
    const res = await POST(
      new Request("http://localhost:47821/api/auth/device/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode: "device-code" }),
      })
    );
    const data = await res.json();
    expect(data.status).toBe("success");
    expect(data.username).toBe("octocat");
    expect(data.token).toBeUndefined();

    const { getGithubSession } = await import("@/lib/profiles");
    const session = await getGithubSession();
    expect(session?.token).toBe("gho_secret_should_not_leak");
    expect(session?.login).toBe("octocat");
  });
});
