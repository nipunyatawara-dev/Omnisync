import { NextResponse } from "next/server";
import { getOauthConfig } from "@/lib/profiles";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const nonce = request.headers.get("x-nonce") || "";

  if (error || errorDescription) {
    return new NextResponse(
      renderHtmlResponse(nonce, false, "", "", "", errorDescription || error || "Unknown OAuth error"),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return new NextResponse(
      renderHtmlResponse(nonce, false, "", "", "", "No authorization code returned from GitHub"),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const config = await getOauthConfig();
    const clientId = config.githubClientId;
    const clientSecret = config.githubClientSecret;

    if (!clientId || !clientSecret) {
      return new NextResponse(
        renderHtmlResponse(nonce, false, "", "", "", "GitHub OAuth Application is not configured on the server"),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Exchange code for token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new NextResponse(
        renderHtmlResponse(nonce, false, "", "", "", tokenData.error_description || tokenData.error),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const accessToken = tokenData.access_token;

    // Fetch user profile
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
      console.error("[auth/callback] profile fetch failed:", userRes.status, userErr);
      return new NextResponse(
        renderHtmlResponse(nonce, false, "", "", "", "Failed to retrieve GitHub profile"),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const userData = await userRes.json();
    const username = userData.login;
    const avatarUrl = userData.avatar_url || "";

    return new NextResponse(
      renderHtmlResponse(nonce, true, accessToken, username, avatarUrl),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err: unknown) {
    console.error("[auth/callback] failed:", err);
    return new NextResponse(
      renderHtmlResponse(nonce, false, "", "", "", "OAuth callback error"),
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

// Serialize an object safely for embedding in an inline <script> block.
// JSON.stringify alone does not escape sequences like </script> or the
// line/paragraph separators that can break out of the script context.
function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHtmlResponse(
  nonce: string,
  success: boolean,
  token: string,
  username: string,
  avatarUrl: string,
  errorMessage = ""
) {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  const safeUsername = escapeHtml(username);
  const safeError = escapeHtml(errorMessage);
  const statusObject = serializeForScript({
    success,
    token,
    username,
    avatarUrl,
    error: errorMessage
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>GitHub Authentication</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0d1117;
      color: #c9d1d9;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background-color: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 24px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    h1 {
      font-size: 20px;
      margin-top: 0;
      color: ${success ? "#2ea44f" : "#f85149"};
    }
    p {
      font-size: 14px;
      color: #8b949e;
      line-height: 1.5;
    }
    .loader-note {
      margin: 20px auto 0;
      font-size: 13px;
      color: #58a6ff;
      letter-spacing: 0.08em;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${success ? "Sign-in Successful" : "Sign-in Failed"}</h1>
    <p>${success ? `Successfully authenticated as <strong>@${safeUsername}</strong>.` : `Error: ${safeError}`}</p>
    <p>${success ? "Closing this window and returning to OmniSync..." : "You can close this window and try again."}</p>
    ${success ? '<p class="loader-note" aria-live="polite">Returning to OmniSync…</p>' : ""}
  </div>
  <script${nonceAttr}>
    const status = ${statusObject};
    
    try {
      if (window.opener) {
        window.opener.postMessage(status, window.location.origin);
        setTimeout(() => {
          window.close();
        }, 1000);
      } else {
        // Direct redirect fallback
        if (status.success) {
          try {
            sessionStorage.setItem("oauth_token", status.token);
            sessionStorage.setItem("oauth_username", status.username);
            sessionStorage.setItem("oauth_avatar", status.avatarUrl);
          } catch (e) {
            console.error("sessionStorage error:", e);
          }
          const url = new URL("/setup", window.location.origin);
          url.searchParams.set("oauth_success", "true");
          window.location.href = url.toString();
        } else {
          const url = new URL("/setup", window.location.origin);
          url.searchParams.set("oauth_error", status.error);
          window.location.href = url.toString();
        }
      }
    } catch (e) {
      console.error("Failed to post message back to main window", e);
    }
  </script>
</body>
</html>`;
}
