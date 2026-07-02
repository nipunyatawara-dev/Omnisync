import { execFile } from "child_process";
import path from "path";

export type IdeSlug =
  | "vscode"
  | "zed"
  | "intellij"
  | "webstorm"
  | "xcode"
  | "antigravity"
  | "codex";

const IDE_MAC_NAMES: Record<IdeSlug, string> = {
  vscode: "Visual Studio Code",
  zed: "Zed",
  intellij: "IntelliJ IDEA",
  webstorm: "WebStorm",
  xcode: "Xcode",
  antigravity: "Antigravity",
  codex: "Codex",
};

const IDE_WIN_PATHS: Partial<Record<IdeSlug, string[]>> = {
  vscode: [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "Code.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft VS Code", "Code.exe"),
  ],
  zed: [path.join(process.env.LOCALAPPDATA || "", "Programs", "Zed", "zed.exe")],
};

const IDE_LINUX_CMDS: Partial<Record<IdeSlug, string[]>> = {
  vscode: ["code"],
  zed: ["zed"],
  intellij: ["idea"],
  webstorm: ["webstorm"],
};

function execOpen(args: string[], timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(args[0], args.slice(1), { timeout }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function openUrl(url: string): Promise<void> {
  if (process.platform === "win32") {
    await execOpen(["cmd", "/c", "start", "", url]);
  } else if (process.platform === "darwin") {
    await execOpen(["open", url]);
  } else {
    await execOpen(["xdg-open", url]);
  }
}

export async function openPath(targetPath: string): Promise<void> {
  if (process.platform === "win32") {
    await execOpen(["explorer", targetPath]);
  } else if (process.platform === "darwin") {
    await execOpen(["open", targetPath]);
  } else {
    await execOpen(["xdg-open", targetPath]);
  }
}

export async function launchIde(ide: IdeSlug, cwd: string): Promise<string> {
  if (process.platform === "darwin") {
    const appName = IDE_MAC_NAMES[ide];
    if (!appName) throw new Error("Unsupported IDE target");
    await execOpen(["open", "-a", appName, cwd]);
    return appName;
  }

  if (process.platform === "win32") {
    const candidates = IDE_WIN_PATHS[ide];
    if (candidates) {
      const { promises: fs } = await import("fs");
      for (const exe of candidates) {
        try {
          await fs.access(exe);
          await execOpen([exe, cwd]);
          return path.basename(exe);
        } catch {
          // try next
        }
      }
    }
    await execOpen(["cmd", "/c", "start", "", "code", cwd]);
    return "code";
  }

  const cmds = IDE_LINUX_CMDS[ide] || ["xdg-open"];
  if (cmds[0] === "xdg-open") {
    await execOpen(["xdg-open", cwd]);
  } else {
    await execOpen([cmds[0], cwd]);
  }
  return cmds[0];
}

export async function openXcodeProject(cwd: string, targetFile: string): Promise<void> {
  const fullPath = path.join(cwd, targetFile);
  if (process.platform === "darwin") {
    await execOpen(["open", fullPath]);
    return;
  }
  if (process.platform === "win32") {
    throw new Error("Xcode is only available on macOS");
  }
  throw new Error("Xcode is only available on macOS");
}

export function runElectronDev(cwd: string): void {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  execFile(npmCmd, ["run", "electron"], { cwd }, (err) => {
    if (err) console.error("Failed to run Electron process:", err);
  });
}
