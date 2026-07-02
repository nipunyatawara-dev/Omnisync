import { getOauthConfig } from "@/lib/profiles";

/** Public OmniSync GitHub OAuth app — used for Device Flow when no custom app is configured. */
export const BUNDLED_GITHUB_OAUTH_CLIENT_ID = "Ov23li8zIwN0BXPmjmA4";

/**
 * Resolve the GitHub OAuth client ID from saved config, env vars, or the bundled default.
 * Set OMNISYNC_REQUIRE_GITHUB_OAUTH_CONFIG=true to disable the bundled fallback (self-hosted).
 */
export async function resolveGithubClientId(): Promise<string | null> {
  const config = await getOauthConfig();
  const fromConfig =
    config.githubClientId ||
    process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ||
    process.env.GITHUB_CLIENT_ID;

  if (fromConfig) return fromConfig;

  if (process.env.OMNISYNC_REQUIRE_GITHUB_OAUTH_CONFIG === "true") {
    return null;
  }

  return BUNDLED_GITHUB_OAUTH_CLIENT_ID;
}

export async function requireGithubClientId(): Promise<string> {
  const clientId = await resolveGithubClientId();
  if (!clientId) {
    throw new Error(
      "GitHub OAuth client ID is not configured. Set GITHUB_CLIENT_ID or configure OAuth in settings."
    );
  }
  return clientId;
}
