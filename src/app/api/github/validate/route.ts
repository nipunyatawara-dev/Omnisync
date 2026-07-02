import { NextResponse } from "next/server";
import { saveGithubSession } from "@/lib/profiles";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "OmniSync-Local-Client",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { valid: false, error: "Invalid or expired GitHub token" },
        { status: 401 }
      );
    }

    const data = await res.json();
    await saveGithubSession({
      token,
      login: data.login,
      avatarUrl: data.avatar_url || "",
    });

    return NextResponse.json({
      valid: true,
      login: data.login,
      name: data.name || data.login,
      avatarUrl: data.avatar_url || "",
    });
  } catch (error: unknown) {
    console.error("[github/validate] failed:", error);
    return NextResponse.json({ error: "Failed to validate token" }, { status: 500 });
  }
}
