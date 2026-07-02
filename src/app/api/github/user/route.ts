import { NextResponse } from "next/server";
import { getGithubToken } from "@/lib/profiles";

export async function GET() {
  try {
    const token = await getGithubToken();
    if (!token) {
      return NextResponse.json({ error: "No GitHub token available" }, { status: 401 });
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
      const errText = await res.text();
      console.error("[github/user] GitHub API error:", res.status, errText);
      return NextResponse.json({ error: "GitHub API request failed" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      login: data.login,
      name: data.name || data.login,
      avatarUrl: data.avatar_url || "",
      htmlUrl: data.html_url || "",
      bio: data.bio || "Active developer profile",
      publicRepos: data.public_repos ?? 0,
    });
  } catch (error: unknown) {
    console.error("[github/user] request failed:", error);
    return NextResponse.json({ error: "Failed to fetch GitHub user" }, { status: 500 });
  }
}
