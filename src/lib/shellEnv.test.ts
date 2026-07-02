import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const requireShellEnv = createRequire(path.join(process.cwd(), "package.json"));
const { augmentProcessEnv, getLoginShellPath, resolveCommand } = requireShellEnv(
  path.join(process.cwd(), "shellEnv.js")
);

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
