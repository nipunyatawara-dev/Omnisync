import { NextResponse } from "next/server";
import { requireGithubClientId } from "@/lib/githubOAuth";

export async function POST(request: Request) {
  try {
    const { deviceCode } = await request.json();
    if (!deviceCode) {
      return NextResponse.json({ error: "Missing deviceCode" }, { status: 400 });
    }

    const clientId = await requireGithubClientId();

    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();

    if (data.error) {
      if (data.error === "authorization_pending") {
        return NextResponse.json({ status: "pending" });
      }
      return NextResponse.json({ status: "error", error: data.error_description || data.error });
    }

    const accessToken = data.access_token;

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "OmniSync-Local-Client",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!userRes.ok) {
      const userErr = await userRes.text();
      console.error("[auth/device/poll] profile fetch failed:", userRes.status, userErr);
      return NextResponse.json({ status: "error", error: "Failed to retrieve GitHub profile" });
    }

    const userData = await userRes.json();
    const username = userData.login;
    const avatarUrl = userData.avatar_url || "";

    return NextResponse.json({
      status: "success",
      token: accessToken,
      username,
      avatarUrl,
    });
  } catch (error: unknown) {
    console.error("[auth/device/poll] failed:", error);
    return NextResponse.json({ status: "error", error: "Authorization polling failed" }, { status: 500 });
  }
}
