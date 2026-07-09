import { NextResponse } from "next/server";
import { getActiveProfile } from "@/lib/profiles";
import { getGlobalSettings } from "@/lib/globalSettings";
import { startRunner, stopRunner, getRunnerStatus, getRunnerLogs } from "@/lib/runner";

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const status = getRunnerStatus();
  const logs = getRunnerLogs();
  return NextResponse.json({
    status,
    logs,
    runCommand: profile.runCommand || "npm run dev",
    port: profile.port || 3000,
  });
}

export async function POST(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  try {
    const { action } = await request.json();
    const global = await getGlobalSettings();
    const runCommand = profile.runCommand || "npm run dev";
    const buildCommand = profile.buildCommand || "npm run build";
    const port = profile.port && profile.port > 0 ? profile.port : 3000;

    if (action === "start") {
      const status = await startRunner(profile.workspacePath, {
        runCommand,
        buildCommand,
        port,
        shell: global.terminalShell,
      });
      return NextResponse.json({ success: true, status, runCommand, port });
    }

    if (action === "stop") {
      const status = stopRunner();
      return NextResponse.json({ success: true, status });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
