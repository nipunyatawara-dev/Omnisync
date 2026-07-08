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
    if (process.env.NODE_ENV !== "production") {
      console.log("[OmniSync] Generated standalone API token (not logged)");
    }
  }
  serverToken = globalRef.omnisyncServerToken;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLocalHostname(value: string | null | undefined): boolean {
  if (!value) return false;
  const hostname = value.replace(/^\[/, "").replace(/\]$/, "").split(":")[0];
  return LOCAL_HOSTNAMES.has(hostname) || LOCAL_HOSTNAMES.has(value.split(":")[0]);
}

function isProtectedApiPath(path: string): boolean {
  return (
    path.startsWith("/api/workspace") ||
    path.startsWith("/api/profiles") ||
    path.startsWith("/api/github") ||
    path.startsWith("/api/auth/config") ||
    path.startsWith("/api/settings")
  );
}

function unauthorized(message: string, status = 401) {
  return new NextResponse(
    JSON.stringify({ error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

function buildCsp(nonce: string | null): string {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https://avatars.githubusercontent.com https://github.com",
    "connect-src 'self' https://api.github.com https://github.com http://localhost:* ws://localhost:*",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ") + ";";
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Protect sensitive API endpoints.
  if (isProtectedApiPath(path)) {
    // Defense-in-depth against DNS rebinding / cross-origin local access:
    // only accept requests addressed to a local host, from a local origin.
    const host = request.headers.get("host");
    const origin = request.headers.get("origin");
    if (!isLocalHostname(host)) {
      return unauthorized("Forbidden host", 403);
    }
    if (origin && !isLocalHostname(new URL(origin).hostname)) {
      return unauthorized("Forbidden origin", 403);
    }

    const token = request.cookies.get("omnisync_token")?.value;
    if (!token || token !== serverToken) {
      return unauthorized("Unauthorized: Invalid or missing API token");
    }
  }

  // Apply a Content-Security-Policy to every response. In production this is a
  // strict nonce + strict-dynamic policy so no inline scripts can execute.
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
    // Next.js reads the nonce from this header and applies it to its scripts.
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Run on all routes except static assets, so pages receive the CSP header.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
