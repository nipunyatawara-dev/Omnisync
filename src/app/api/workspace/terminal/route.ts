import { NextResponse } from "next/server";
import { getActiveProfile } from "@/lib/profiles";
import {
  appendTerminalLine,
  buildTerminalPrompt,
  clearTerminal,
  getTerminalSnapshot,
  runManualTerminalCommand,
  setTerminalPrompt,
} from "@/lib/dashboardTerminal";

export async function GET(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  setTerminalPrompt(buildTerminalPrompt(profile.workspacePath));

  const since = Number(new URL(request.url).searchParams.get("since") || "0");
  return NextResponse.json(getTerminalSnapshot(since));
}

export async function POST(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const command = typeof body.command === "string" ? body.command.trim() : "";
    if (!command) {
      return NextResponse.json({ error: "Command is required" }, { status: 400 });
    }

    setTerminalPrompt(buildTerminalPrompt(profile.workspacePath));
    const exitCode = await runManualTerminalCommand(profile.workspacePath, command);
    return NextResponse.json({
      success: exitCode === 0,
      exitCode,
      ...getTerminalSnapshot(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    appendTerminalLine(msg, "error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  clearTerminal();
  return NextResponse.json({ success: true });
}
