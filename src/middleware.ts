import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isProduction = process.env.NODE_ENV === "production";

// In production, require an explicitly provisioned token (Electron sets this).
// In development, keep a persistent in-memory token so standalone `next dev`
// still works — but that mode is not a supported secure deployment.
let serverToken = process.env.OMNISYNC_API_TOKEN || null;
if (!serverToken && !isProduction) {
  const globalRef = globalThis as unknown as { omnisyncServerToken?: string };
  if (!globalRef.omnisyncServerToken) {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    globalRef.omnisyncServerToken = Array.from(array, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    console.log("[OmniSync] Generated standalone API token (not logged)");
  }
  serverToken = globalRef.omnisyncServerToken;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLocalHostname(value: string | null | undefined): boolean {
  if (!value) return false;
  const hostname = value.replace(/^\[/, "").replace(/\]$/, "").split(":")[0];
  return LOCAL_HOSTNAMES.has(hostname) || LOCAL_HOSTNAMES.has(value.split(":")[0]);
}

/** Protect all /api/* routes (local desktop app — no public API surface). */
function isProtectedApiPath(path: string): boolean {
  return path.startsWith("/api/");
}

function unauthorized(message: string, status = 401) {
  return new NextResponse(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildCsp(nonce: string | null): string {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return (
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https://avatars.githubusercontent.com https://github.com",
      "connect-src 'self' https://api.github.com https://github.com http://localhost:* ws://localhost:*",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ") + ";"
  );
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (isProtectedApiPath(path)) {
    if (isProduction && !process.env.OMNISYNC_API_TOKEN) {
      return unauthorized("Server misconfigured: API token not provisioned", 503);
    }

    const host = request.headers.get("host");
    const origin = request.headers.get("origin");
    if (!isLocalHostname(host)) {
      return unauthorized("Forbidden host", 403);
    }
    if (origin && !isLocalHostname(new URL(origin).hostname)) {
      return unauthorized("Forbidden origin", 403);
    }

    const token = request.cookies.get("omnisync_token")?.value;
    if (!serverToken || !token || token !== serverToken) {
      return unauthorized("Unauthorized: Invalid or missing API token");
    }
  }

  const isDev = process.env.NODE_ENV !== "production";
  let nonce: string | null = null;
  if (!isDev) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    nonce = btoa(String.fromCharCode(...bytes));
  }

  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
