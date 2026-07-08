import { NextResponse } from "next/server";
import { getActiveProfile } from "@/lib/profiles";
import { resolveWorkspaceCwd } from "@/lib/workspaceAccess";
import { log } from "@/lib/logger";
import { promises as fs } from "fs";
import path from "path";
import { getRunnerLogs } from "@/lib/runner";
import {
  launchIde,
  openPath,
  openUrl,
  openXcodeProject,
  runElectronDev,
  type IdeSlug,
} from "@/lib/platformLaunch";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;
  const launchOptions: string[] = [];

  try {
    if (await pathExists(cwd)) {
      const files = await fs.readdir(cwd);
      const hasXcode =
        process.platform === "darwin" &&
        files.some(
          (f) =>
            f.endsWith(".xcworkspace") ||
            f.endsWith(".xcodeproj") ||
            f === "ios" ||
            f === "macos"
        );
      if (hasXcode) {
        launchOptions.push("xcode");
      }

      const packageJsonPath = path.join(cwd, "package.json");
      if (await pathExists(packageJsonPath)) {
        try {
          const pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          const scripts = pkg.scripts || {};

          if (deps.electron || scripts.electron) {
            launchOptions.push("electron");
          }
        } catch {}

        launchOptions.push("browser");
      }
    }
  } catch {}

  if (launchOptions.length === 0) {
    launchOptions.push("browser");
  }

  return NextResponse.json({ launchOptions });
}

export async function POST(request: Request) {
  try {
    const { type, port, ide, workspacePath } = await request.json();
    const requested =
      typeof workspacePath === "string" ? workspacePath : undefined;
    const resolved = await resolveWorkspaceCwd(requested);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const cwd = resolved.cwd;

    if (type === "folder") {
      await openPath(cwd);
      return NextResponse.json({ success: true });
    }

    if (type === "ide") {
      if (!ide || typeof ide !== "string") {
        return NextResponse.json({ error: "IDE parameter missing" }, { status: 400 });
      }
      const launched = await launchIde(ide as IdeSlug, cwd);
      return NextResponse.json({ success: true, launched });
    }

    if (type === "browser") {
      const logs = getRunnerLogs();
      const urlRegex = /http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d+)/i;
      const defaultPort = typeof port === "number" && port > 0 ? port : 3000;
      let url = `http://localhost:${defaultPort}`;

      for (let i = logs.length - 1; i >= 0; i--) {
        const match = logs[i].match(urlRegex);
        if (match) {
          url = match[0].replace("0.0.0.0", "localhost").replace("[::1]", "localhost");
          break;
        }
      }

      await openUrl(url);
      return NextResponse.json({ success: true, url });
    }

    if (type === "xcode") {
      const files = await fs.readdir(cwd);
      let targetFile = files.find((f) => f.endsWith(".xcworkspace"));
      if (!targetFile) {
        targetFile = files.find((f) => f.endsWith(".xcodeproj"));
      }

      if (!targetFile) {
        for (const sub of ["ios", "macos"]) {
          const subPath = path.join(cwd, sub);
          if (await pathExists(subPath)) {
            const subFiles = await fs.readdir(subPath);
            const match = subFiles.find(
              (f) => f.endsWith(".xcworkspace") || f.endsWith(".xcodeproj")
            );
            if (match) {
              targetFile = `${sub}/${match}`;
              break;
            }
          }
        }
      }

      if (!targetFile) {
        return NextResponse.json(
          { error: "No Xcode workspace or project file found." },
          { status: 400 }
        );
      }

      await openXcodeProject(cwd, targetFile);
      return NextResponse.json({ success: true });
    }

    if (type === "electron") {
      runElectronDev(cwd);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid launch type" }, { status: 400 });
  } catch (err: unknown) {
    log.error("launch", "failed", { err: String(err) });
    const msg = err instanceof Error ? err.message : "Launch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
