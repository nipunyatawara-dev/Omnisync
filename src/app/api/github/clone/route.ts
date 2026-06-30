import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  try {
    const { cloneUrl, localPath, token } = await request.json();

    if (!cloneUrl || !localPath || !token) {
      return NextResponse.json({ error: "Missing required parameters: cloneUrl, localPath, or token" }, { status: 400 });
    }

    // Ensure the parent directory of localPath exists
    const parentDir = path.dirname(localPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Verify if directory already exists and is not empty
    try {
      const files = await fs.readdir(localPath);
      if (files.length > 0) {
        return NextResponse.json({ error: "Target directory already exists and is not empty." }, { status: 400 });
      }
    } catch {
      // Directory doesn't exist, which is fine
    }

    // Inject token into clone URL: https://x-access-token:<token>@github.com/...
    const urlObj = new URL(cloneUrl);
    urlObj.username = "x-access-token";
    urlObj.password = token;
    const authenticatedUrl = urlObj.toString();

    // Create a streaming response
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

        sendLog(`> Initializing target directory: ${localPath}`);
        sendLog(`> git clone --progress "${cloneUrl.replace(token, "******")}" "${localPath}"`);

        // Spawn git clone process with progress enabled
        const gitProcess = spawn("git", ["clone", "--progress", authenticatedUrl, localPath]);

        gitProcess.stdout.on("data", (data) => {
          const lines = data.toString().split("\n");
          lines.forEach((line: string) => {
            if (line.trim()) {
              sendLog(line.replace(token, "******"));
            }
          });
        });

        gitProcess.stderr.on("data", (data) => {
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

          // Set origin URL back to clean URL to scrub token
          const cleanUrl = cloneUrl.endsWith(".git") ? cloneUrl : `${cloneUrl}.git`;
          const scrubProcess = spawn("git", ["remote", "set-url", "origin", cleanUrl], { cwd: localPath });

          scrubProcess.on("close", (scrubCode) => {
            if (scrubCode !== 0) {
              sendLog(`[Warning] Failed to reset remote URL, token might still be cached: code ${scrubCode}`);
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
        "Connection": "keep-alive",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Clone failed: ${msg}` }, { status: 500 });
  }
}
