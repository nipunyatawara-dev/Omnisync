import { NextResponse } from "next/server";
import { saveOauthConfig } from "@/lib/profiles";
import { resolveGithubClientId } from "@/lib/githubOAuth";

export async function GET() {
  try {
    const clientId = await resolveGithubClientId();
    return NextResponse.json({
      hasConfig: !!clientId,
      clientId: clientId || "",
    });
  } catch (error: unknown) {
    console.error("[auth/config] GET failed:", error);
    return NextResponse.json({ error: "Failed to load configuration" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { clientId, clientSecret } = await request.json();
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Missing Client ID or Client Secret" }, { status: 400 });
    }
    await saveOauthConfig({
      githubClientId: clientId,
      githubClientSecret: clientSecret,
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[auth/config] POST failed:", error);
    return NextResponse.json({ error: "Failed to save configuration" }, { status: 500 });
  }
}
