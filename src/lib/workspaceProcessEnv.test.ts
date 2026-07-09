import { describe, it, expect } from "vitest";
import {
  buildWorkspaceChildEnv,
  shouldStripWorkspaceEnvKey,
  workspaceEnvModeForRunCommand,
} from "@/lib/workspaceProcessEnv";

describe("workspaceProcessEnv", () => {
  it("strips OmniSync and Next parent variables", () => {
    expect(shouldStripWorkspaceEnvKey("OMNISYNC_API_TOKEN")).toBe(true);
    expect(shouldStripWorkspaceEnvKey("NEXT_RUNTIME")).toBe(true);
    expect(shouldStripWorkspaceEnvKey("__NEXT_PRIVATE_ORIGIN")).toBe(true);
    expect(shouldStripWorkspaceEnvKey("ELECTRON_RUN_AS_NODE")).toBe(true);
    expect(shouldStripWorkspaceEnvKey("NODE_ENV")).toBe(true);
    expect(shouldStripWorkspaceEnvKey("HOSTNAME")).toBe(true);
    expect(shouldStripWorkspaceEnvKey("PATH")).toBe(false);
    expect(shouldStripWorkspaceEnvKey("HOME")).toBe(false);
  });

  it("sets NODE_ENV=development for dev commands", () => {
    expect(workspaceEnvModeForRunCommand("npm run dev")).toBe("development");
    expect(workspaceEnvModeForRunCommand("next dev")).toBe("development");
    expect(workspaceEnvModeForRunCommand("npm run start")).toBe("production");
  });

  it("builds isolated env with development mode", () => {
    const prev = process.env.NODE_ENV;
    const prevNext = process.env.NEXT_RUNTIME;
    process.env.NODE_ENV = "production";
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.OMNISYNC_API_TOKEN = "secret";

    try {
      const env = buildWorkspaceChildEnv("/tmp/project", {
        port: 3000,
        mode: "development",
      });
      expect(env.NODE_ENV).toBe("development");
      expect(env.PORT).toBe("3000");
      expect(env.PWD).toBe("/tmp/project");
      expect(env.NEXT_RUNTIME).toBeUndefined();
      expect(env.OMNISYNC_API_TOKEN).toBeUndefined();
      expect(env.PATH).toBeTruthy();
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
      if (prevNext === undefined) delete process.env.NEXT_RUNTIME;
      else process.env.NEXT_RUNTIME = prevNext;
      delete process.env.OMNISYNC_API_TOKEN;
    }
  });
});
