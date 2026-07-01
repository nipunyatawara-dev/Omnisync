import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Keep a persistent token in-memory if process.env.OMNISYNC_API_TOKEN isn't set,
// using globalThis to survive Next.js fast refresh/hot reloads in development.
let serverToken = process.env.OMNISYNC_API_TOKEN;
if (!serverToken) {
  const globalRef = globalThis as unknown as { omnisyncServerToken?: string };
  if (!globalRef.omnisyncServerToken) {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    globalRef.omnisyncServerToken = Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
    console.log(`[OmniSync] Generated standalone API Token: ${globalRef.omnisyncServerToken}`);
  }
  serverToken = globalRef.omnisyncServerToken;
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Protect all Workspace, Profile, GitHub, and authentication configuration endpoints
  if (
    path.startsWith("/api/workspace") ||
    path.startsWith("/api/profiles") ||
    path.startsWith("/api/github") ||
    path.startsWith("/api/auth/config")
  ) {
    const token = request.cookies.get("omnisync_token")?.value;
    if (!token || token !== serverToken) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized: Invalid or missing API token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/workspace/:path*",
    "/api/profiles/:path*",
    "/api/github/:path*",
    "/api/auth/config",
  ],
};
