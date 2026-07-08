import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/workspace/file-content/route";
import * as profiles from "@/lib/profiles";
import * as pathSafety from "@/lib/pathSafety";
import { promises as fs } from "fs";

vi.mock("@/lib/profiles", () => ({
  getActiveProfile: vi.fn(),
}));

vi.mock("@/lib/pathSafety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pathSafety")>();
  return {
    ...actual,
    resolveSafePath: vi.fn(),
  };
});

vi.mock("fs", () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

describe("file-content route", () => {
  const workspace = "/workspace";

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(profiles.getActiveProfile).mockResolvedValue({
      id: "p1",
      name: "Test",
      profession: "dev",
      workspacePath: workspace,
      createdAt: "",
      updatedAt: "",
    });
    vi.mocked(pathSafety.resolveSafePath).mockResolvedValue("/workspace/readme.md");
  });

  it("GET rejects files over read limit", async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 3 * 1024 * 1024 } as Awaited<ReturnType<typeof fs.stat>>);

    const req = new Request("http://localhost/api/workspace/file-content?file=readme.md");
    const res = await GET(req);
    expect(res.status).toBe(413);
  });

  it("POST rejects content over write limit", async () => {
    const req = new Request("http://localhost/api/workspace/file-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: "readme.md", content: "x".repeat(2 * 1024 * 1024 + 1) }),
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("GET reads file within limit", async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 10 } as Awaited<ReturnType<typeof fs.stat>>);
    vi.mocked(fs.readFile).mockResolvedValue("hello");

    const req = new Request("http://localhost/api/workspace/file-content?file=readme.md");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("hello");
  });
});
