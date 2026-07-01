import { NextResponse } from "next/server";
import { getOauthConfig } from "@/lib/profiles";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error || errorDescription) {
    return new NextResponse(
      renderHtmlResponse(false, "", "", "", errorDescription || error || "Unknown OAuth error"),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return new NextResponse(
      renderHtmlResponse(false, "", "", "", "No authorization code returned from GitHub"),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const config = await getOauthConfig();
    const clientId = config.githubClientId;
    const clientSecret = config.githubClientSecret;

    if (!clientId || !clientSecret) {
      return new NextResponse(
        renderHtmlResponse(false, "", "", "", "GitHub OAuth Application is not configured on the server"),
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
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new NextResponse(
        renderHtmlResponse(false, "", "", "", tokenData.error_description || tokenData.error),
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
    });

    if (!userRes.ok) {
      const userErr = await userRes.text();
      return new NextResponse(
        renderHtmlResponse(false, "", "", "", `Failed to retrieve GitHub profile: ${userErr}`),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const userData = await userRes.json();
    const username = userData.login;
    const avatarUrl = userData.avatar_url || "";

    return new NextResponse(
      renderHtmlResponse(true, accessToken, username, avatarUrl),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(
      renderHtmlResponse(false, "", "", "", `OAuth Callback Error: ${msg}`),
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

function renderHtmlResponse(
  success: boolean,
  token: string,
  username: string,
  avatarUrl: string,
  errorMessage = ""
) {
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
    .spinner {
      border: 3px solid rgba(88, 166, 255, 0.1);
      border-top: 3px solid #58a6ff;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      animation: spin 1s linear infinite;
      margin: 20px auto 0;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${success ? "Sign-in Successful" : "Sign-in Failed"}</h1>
    <p>${success ? `Successfully authenticated as <strong>@${username}</strong>.` : `Error: ${errorMessage}`}</p>
    <p>${success ? "Closing this window and returning to OmniSync..." : "You can close this window and try again."}</p>
    ${success ? '<div class="spinner"></div>' : ""}
  </div>
  <script>
    const status = {
      success: ${success},
      token: "${token}",
      username: "${username}",
      avatarUrl: "${avatarUrl}",
      error: "${errorMessage.replace(/"/g, '\\"')}"
    };
    
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
