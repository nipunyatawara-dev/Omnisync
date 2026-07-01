import { NextResponse } from "next/server";
import { getActiveProfile } from "@/lib/profiles";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { getRunnerLogs } from "@/lib/runner";

// GET: Scan workspace directory and return available launch targets
export async function GET() {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;
  const launchOptions: string[] = [];

  try {
    if (fs.existsSync(cwd)) {
      const files = fs.readdirSync(cwd);
      const hasXcode = files.some(
        (f) => f.endsWith(".xcworkspace") || f.endsWith(".xcodeproj") || f === "ios" || f === "macos"
      );
      if (hasXcode) {
        launchOptions.push("xcode");
      }

      const packageJsonPath = path.join(cwd, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          const scripts = pkg.scripts || {};

          if (deps.electron || scripts.electron) {
            launchOptions.push("electron");
          }
        } catch {}

        // Always assume browser is an option if package.json exists (meaning web project)
        launchOptions.push("browser");
      }
    }
  } catch {}

  // Fallback default: browser
  if (launchOptions.length === 0) {
    launchOptions.push("browser");
  }

  return NextResponse.json({ launchOptions });
}

// POST: Execute launch action
export async function POST(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const cwd = profile.workspacePath;

  try {
    const { type, port, ide } = await request.json();

    if (type === "ide") {
      let appName = "";
      if (ide === "vscode") appName = "Visual Studio Code";
      else if (ide === "zed") appName = "Zed";
      else if (ide === "intellij") appName = "IntelliJ IDEA";
      else if (ide === "webstorm") appName = "WebStorm";
      else if (ide === "xcode") appName = "Xcode";
      else if (ide === "antigravity") appName = "Antigravity";
      else if (ide === "codex") appName = "Codex";

      if (appName) {
        exec(`open -a "${appName}" "${cwd}"`, (err) => {
          if (err) {
            console.error(`Failed to launch ${appName}:`, err);
          }
        });
        return NextResponse.json({ success: true, launched: appName });
      }
      return NextResponse.json({ error: "Unsupported IDE target" }, { status: 400 });
    }

    if (type === "browser") {
      const logs = getRunnerLogs();
      const urlRegex = /http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d+)/i;
      let url = `http://localhost:${port || 3000}`; // fallback default
      
      for (let i = logs.length - 1; i >= 0; i--) {
        const match = logs[i].match(urlRegex);
        if (match) {
          url = match[0].replace("0.0.0.0", "localhost").replace("[::1]", "localhost");
          break;
        }
      }

      exec(`open "${url}"`);
      return NextResponse.json({ success: true, url });
    }

    if (type === "xcode") {
      const files = fs.readdirSync(cwd);
      let targetFile = files.find((f) => f.endsWith(".xcworkspace"));
      if (!targetFile) {
        targetFile = files.find((f) => f.endsWith(".xcodeproj"));
      }

      // Check subdirectories like ios/ or macos/ if none found in root
      if (!targetFile) {
        for (const sub of ["ios", "macos"]) {
          const subPath = path.join(cwd, sub);
          if (fs.existsSync(subPath)) {
            const subFiles = fs.readdirSync(subPath);
            const match = subFiles.find((f) => f.endsWith(".xcworkspace") || f.endsWith(".xcodeproj"));
            if (match) {
              targetFile = `${sub}/${match}`;
              break;
            }
          }
        }
      }

      if (!targetFile) {
        return NextResponse.json({ error: "No Xcode workspace or project file found." }, { status: 400 });
      }

      exec(`open "${path.join(cwd, targetFile)}"`);
      return NextResponse.json({ success: true });
    }

    if (type === "electron") {
      exec(`npm run electron`, { cwd });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid launch type" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
