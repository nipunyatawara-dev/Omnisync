import { NextResponse } from "next/server";
import { requireGithubClientId } from "@/lib/githubOAuth";

export async function POST() {
  try {
    const clientId = await requireGithubClientId();

    const res = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: "repo,user",
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    if (data.error) {
      return NextResponse.json({ error: data.error_description || data.error }, { status: 400 });
    }

    return NextResponse.json({
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      interval: data.interval || 5,
      expiresIn: data.expires_in,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("not configured")) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[auth/device/code] failed:", error);
    return NextResponse.json({ error: "Failed to start device authorization" }, { status: 500 });
  }
}
