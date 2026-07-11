import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getActiveProfile, getGithubToken } from "@/lib/profiles";
import { spawnTool } from "@/lib/shellEnv";
import { assertAllowedClonePath } from "@/lib/clonePathSafety";

export async function POST(request: Request) {
  try {
    const { cloneUrl, localPath } = await request.json();

    // Prefer the server-stored token (session or active profile).
    const profile = await getActiveProfile();
    const token = profile?.gitToken || (await getGithubToken());

    if (!cloneUrl || !localPath || !token) {
      return NextResponse.json(
        { error: "Missing required parameters: cloneUrl, localPath, or token" },
        { status: 400 }
      );
    }

    if (typeof localPath !== "string" || !path.isAbsolute(localPath)) {
      return NextResponse.json({ error: "localPath must be an absolute path" }, { status: 400 });
    }

    let safeLocalPath: string;
    try {
      safeLocalPath = await assertAllowedClonePath(localPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid clone path";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Only allow cloning from GitHub over HTTPS. This prevents the injected
    // credentials below from being sent to an arbitrary host.
    let parsedCloneUrl: URL;
    try {
      parsedCloneUrl = new URL(cloneUrl);
    } catch {
      return NextResponse.json({ error: "Invalid clone URL" }, { status: 400 });
    }
    if (parsedCloneUrl.protocol !== "https:" || parsedCloneUrl.hostname !== "github.com") {
      return NextResponse.json(
        { error: "Only https://github.com clone URLs are allowed" },
        { status: 400 }
      );
    }

    const parentDir = path.dirname(safeLocalPath);
    await fs.mkdir(parentDir, { recursive: true });

    try {
      const files = await fs.readdir(safeLocalPath);
      if (files.length > 0) {
        return NextResponse.json(
          { error: "Target directory already exists and is not empty." },
          { status: 400 }
        );
      }
    } catch {
      // Directory doesn't exist, which is fine
    }

    parsedCloneUrl.username = "x-access-token";
    parsedCloneUrl.password = token;
    const authenticatedUrl = parsedCloneUrl.toString();

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        const sendLog = (message: string) => {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "log", message }) + "\n"));
        };

        const sendError = (message: string) => {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message }) + "\n"));
        };

        const sendSuccess = () => {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "success" }) + "\n"));
          controller.close();
        };

        sendLog(`> Initializing target directory: ${safeLocalPath}`);
        sendLog(`> git clone --progress "${cloneUrl}" "${safeLocalPath}"`);

        const gitProcess = spawnTool("git", ["clone", "--progress", authenticatedUrl, safeLocalPath]);

        gitProcess.stdout?.on("data", (data) => {
          const lines = data.toString().split("\n");
          lines.forEach((line: string) => {
            if (line.trim()) {
              sendLog(line.replace(token, "******"));
            }
          });
        });

        gitProcess.stderr?.on("data", (data) => {
          const lines = data.toString().split("\n");
          lines.forEach((line: string) => {
            if (line.trim()) {
              sendLog(line.replace(token, "******"));
            }
          });
        });

        gitProcess.on("close", async (code) => {
          if (code !== 0) {
            sendError(`git clone failed with exit code ${code}`);
            controller.close();
            return;
          }

          sendLog("> Git clone completed successfully.");
          sendLog("> Scrubbing authentication tokens from git configuration origin URL...");

          const cleanUrl = cloneUrl.endsWith(".git") ? cloneUrl : `${cloneUrl}.git`;
          const scrubProcess = spawnTool("git", ["remote", "set-url", "origin", cleanUrl], {
            cwd: safeLocalPath,
          });

          scrubProcess.on("close", (scrubCode) => {
            if (scrubCode !== 0) {
              sendLog(
                `[Warning] Failed to reset remote URL, token might still be cached: code ${scrubCode}`
              );
            } else {
              sendLog("> Remote origin token scrubbed successfully.");
            }

            sendLog("> Setup complete.");
            sendSuccess();
          });
        });
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("[clone] failed:", error);
    return NextResponse.json({ error: "Clone failed" }, { status: 500 });
  }
}
