import { getGithubToken } from "@/lib/profiles";
import { getRemoteOriginUrl } from "@/lib/git";

/** Extract owner/repo from a git remote URL. */
export function parseGithubRepoFullName(remoteUrl: string | null | undefined): string | null {
  if (!remoteUrl) return null;
  const cleaned = remoteUrl.trim().replace(/\.git$/i, "");
  const ssh = cleaned.match(/github\.com[:/]([^/]+)\/([^/]+)$/i);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  try {
    const u = new URL(cleaned);
    if (!/github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  } catch {
    // ignore
  }
  return null;
}

/** GitHub noreply addresses encode the login. */
export function githubLoginFromEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const withId = trimmed.match(/^\d+\+([^@]+)@users\.noreply\.github\.com$/);
  if (withId) return withId[1];
  const plain = trimmed.match(/^([^@]+)@users\.noreply\.github\.com$/);
  if (plain) return plain[1];
  return null;
}

export function githubAvatarUrlForLogin(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=72`;
}

/**
 * Build email → avatar URL map using noreply parsing + recent GitHub commit authors.
 * Keys are lowercased emails.
 */
export async function resolveAuthorAvatars(
  cwd: string,
  authors: { email?: string; name?: string }[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const emails = [
    ...new Set(
      authors
        .map((a) => (a.email || "").trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  for (const email of emails) {
    const login = githubLoginFromEmail(email);
    if (login) map[email] = githubAvatarUrlForLogin(login);
  }

  const remaining = emails.filter((e) => !map[e]);
  if (remaining.length === 0) return map;

  const token = await getGithubToken();
  if (!token) return map;

  const remote = await getRemoteOriginUrl(cwd);
  const fullName = parseGithubRepoFullName(remote);
  if (!fullName) return map;

  try {
    // Pull recent commits — includes author.avatar_url + commit.author.email
    const res = await fetch(
      `https://api.github.com/repos/${fullName}/commits?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "OmniSync-Local-Client",
        },
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) return map;
    const commits = (await res.json()) as Array<{
      author?: { login?: string; avatar_url?: string } | null;
      commit?: { author?: { email?: string; name?: string } };
    }>;

    for (const c of commits) {
      const email = (c.commit?.author?.email || "").trim().toLowerCase();
      const avatar = c.author?.avatar_url;
      const login = c.author?.login;
      if (email && avatar) {
        map[email] = avatar;
      } else if (email && login) {
        map[email] = githubAvatarUrlForLogin(login);
      }
      const name = (c.commit?.author?.name || "").trim().toLowerCase();
      if (name && (avatar || login)) {
        map[`name:${name}`] = avatar || githubAvatarUrlForLogin(login!);
      }
    }
  } catch {
    // leave partial map
  }

  return map;
}
