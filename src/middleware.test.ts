import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

describe("middleware auth", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OMNISYNC_API_TOKEN = "test-token-123";
  });

  it("returns 401 for protected API without token", async () => {
    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://localhost:47821/api/workspace/git", {
      headers: { host: "localhost:47821" },
    });
    const res = middleware(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-local host", async () => {
    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://evil.example/api/workspace/git", {
      headers: {
        host: "evil.example",
        cookie: "omnisync_token=test-token-123",
      },
    });
    const res = middleware(req);
    expect(res.status).toBe(403);
  });

  it("allows protected API with valid token on localhost", async () => {
    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://localhost:47821/api/workspace/git", {
      headers: {
        host: "localhost:47821",
        cookie: "omnisync_token=test-token-123",
      },
    });
    const res = middleware(req);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
