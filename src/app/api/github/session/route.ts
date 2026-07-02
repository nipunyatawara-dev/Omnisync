import { NextResponse } from "next/server";
import { clearGithubSession, saveGithubSession } from "@/lib/profiles";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    await saveGithubSession({
      token,
      login: typeof body.login === "string" ? body.login : undefined,
      avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[github/session] save failed:", error);
    return NextResponse.json({ error: "Failed to save GitHub session" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearGithubSession();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[github/session] clear failed:", error);
    return NextResponse.json({ error: "Failed to clear GitHub session" }, { status: 500 });
  }
}
