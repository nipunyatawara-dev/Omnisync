import { describe, it, expect } from "vitest";
import path from "node:path";
import { candidatePathsFor, windowsToolNames } from "./devToolsBootstrap";

describe("windowsToolNames", () => {
  it("prefers .exe then .cmd", () => {
    expect(windowsToolNames("git")).toEqual(["git.exe", "git.cmd", "git.bat", "git"]);
    expect(windowsToolNames("node.exe")).toEqual(["node.exe"]);
  });
});

describe("candidatePathsFor", () => {
  it("includes Git for Windows and Node.js Program Files locations", () => {
    const paths = candidatePathsFor("git", {
      platform: "win32",
      home: "C:\\Users\\rish",
      toolsBin: "C:\\Users\\rish\\AppData\\Roaming\\omnisync\\tools\\bin",
      env: {
        ProgramFiles: "C:\\Program Files",
        "ProgramFiles(x86)": "C:\\Program Files (x86)",
        LOCALAPPDATA: "C:\\Users\\rish\\AppData\\Local",
        Path: "C:\\Windows\\System32",
      },
    });

    expect(paths).toContain(
      path.join("C:\\Program Files", "Git", "cmd", "git.exe")
    );
    expect(paths).toContain(
      path.join("C:\\Program Files", "Git", "bin", "git.exe")
    );
    expect(paths).toContain(
      path.join("C:\\Users\\rish\\AppData\\Roaming\\omnisync\\tools\\bin", "git.exe")
    );
    expect(paths).toContain(path.join("C:\\Windows\\System32", "git.exe"));
  });

  it("includes standard Windows Node install directories", () => {
    const paths = candidatePathsFor("node", {
      platform: "win32",
      home: "C:\\Users\\rish",
      toolsBin: "C:\\tools\\bin",
      env: {
        ProgramFiles: "C:\\Program Files",
        LOCALAPPDATA: "C:\\Users\\rish\\AppData\\Local",
        Path: "",
      },
    });

    expect(paths).toContain(path.join("C:\\Program Files", "nodejs", "node.exe"));
    expect(paths).toContain(
      path.join("C:\\Users\\rish\\AppData\\Local", "Programs", "nodejs", "node.exe")
    );
  });

  it("keeps macOS Homebrew-style candidates on darwin", () => {
    const paths = candidatePathsFor("node", {
      platform: "darwin",
      home: "/Users/me",
      toolsBin: "/Users/me/Library/Application Support/omnisync/tools/bin",
    });

    expect(paths).toContain("/opt/homebrew/bin/node");
    expect(paths).toContain("/usr/local/bin/node");
    expect(paths.some((p) => p.includes("Program Files"))).toBe(false);
  });
});
