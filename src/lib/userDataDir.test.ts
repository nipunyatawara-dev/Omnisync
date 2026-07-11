import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { writeUserDataFile, writeUserDataJson } from "@/lib/userDataDir";

describe("writeUserDataFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-userdata-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes files with mode 0600", async () => {
    const filePath = path.join(tmpDir, "secret.json");
    await writeUserDataJson(filePath, { hello: "world" });
    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
    const raw = await fs.readFile(filePath, "utf-8");
    expect(JSON.parse(raw)).toEqual({ hello: "world" });
  });

  it("tightens permissions on an existing world-readable file", async () => {
    const filePath = path.join(tmpDir, "loose.json");
    await fs.writeFile(filePath, "{}", { mode: 0o644 });
    await writeUserDataFile(filePath, '{"ok":true}');
    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
