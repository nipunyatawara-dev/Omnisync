"use client";

import type { RepoCommit } from "@/types/dashboard";

interface CollaborationFeedProps {
  commits: RepoCommit[];
  avatars?: Record<string, string>;
  isLoading: boolean;
  sessionAvatarUrl?: string;
  sessionEmail?: string;
  sessionLogin?: string;
}

function relativeTime(isoOrDate: string): string {
  const t = Date.parse(isoOrDate);
  if (Number.isNaN(t)) return isoOrDate;
  const diffSec = Math.round((Date.now() - t) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 14) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function resolveAvatarUrl(
  author: string,
  email: string | undefined,
  avatars: Record<string, string> | undefined,
  sessionAvatarUrl?: string,
  sessionEmail?: string,
  sessionLogin?: string
): string | undefined {
  const emailKey = (email || "").trim().toLowerCase();
  if (
    sessionAvatarUrl &&
    ((emailKey && sessionEmail && emailKey === sessionEmail.toLowerCase()) ||
      (sessionLogin && author.toLowerCase() === sessionLogin.toLowerCase()))
  ) {
    return sessionAvatarUrl;
  }
  if (emailKey && avatars?.[emailKey]) return avatars[emailKey];
  const nameKey = `name:${author.trim().toLowerCase()}`;
  if (avatars?.[nameKey]) return avatars[nameKey];
  return undefined;
}

function AuthorAvatar({ url, author }: { url?: string; author: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={36}
        height={36}
        style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0, backgroundColor: "var(--color-bg-subtle)" }}
        referrerPolicy="no-referrer"
      />
    );
  }
  // Fallback only while GitHub lookup is pending / unavailable
  return (
    <div
      aria-hidden
      title={author}
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        flexShrink: 0,
        backgroundColor: "var(--color-bg-subtle)",
        border: "1px solid var(--color-border-default)",
      }}
    />
  );
}

export default function CollaborationFeed({
  commits,
  avatars,
  isLoading,
  sessionAvatarUrl,
  sessionEmail,
  sessionLogin,
}: CollaborationFeedProps) {
  // git log returns newest first — keep that order (latest at top)
  if (isLoading && commits.length === 0) {
    return (
      <div style={{ padding: "32px", color: "var(--color-fg-muted)", fontSize: "13px" }}>
        Loading collaboration history…
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div style={{ padding: "32px", color: "var(--color-fg-muted)", fontSize: "13px", lineHeight: 1.5 }}>
        No commits for the selected branches. Turn on one or more branches above.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        padding: "16px 20px 28px",
        overflowY: "auto",
        height: "100%",
      }}
    >
      {commits.map((commit) => {
        const avatarUrl = resolveAvatarUrl(
          commit.author,
          commit.email,
          avatars,
          sessionAvatarUrl,
          sessionEmail,
          sessionLogin
        );
        return (
          <div
            key={commit.hash}
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "flex-start",
              maxWidth: "720px",
            }}
          >
            <AuthorAvatar url={avatarUrl} author={commit.author} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  gap: "8px",
                  marginBottom: "4px",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 700 }}>{commit.author || "Unknown"}</span>
                <span style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>
                  {relativeTime(commit.authoredAt || commit.date)}
                </span>
                {commit.isMerge && (
                  <span
                    className="badge"
                    style={{
                      fontSize: "10px",
                      backgroundColor: "var(--color-accent-bg)",
                      border: "1px solid var(--color-accent-border)",
                      color: "var(--color-accent-fg)",
                    }}
                  >
                    merge
                  </span>
                )}
              </div>
              <div
                style={{
                  backgroundColor: "var(--color-bg-subtle)",
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "12px 12px 12px 4px",
                  padding: "10px 14px",
                }}
              >
                <div style={{ fontSize: "13px", lineHeight: 1.45, wordBreak: "break-word" }}>
                  {commit.subject}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    marginTop: "8px",
                    alignItems: "center",
                  }}
                >
                  <code
                    style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-fg-muted)",
                    }}
                  >
                    {commit.hash.slice(0, 7)}
                  </code>
                  {(commit.branches || []).slice(0, 4).map((b) => (
                    <span
                      key={b}
                      style={{
                        fontSize: "10px",
                        fontFamily: "var(--font-mono)",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        backgroundColor: "var(--color-bg-overlay)",
                        border: "1px solid var(--color-border-default)",
                        color: "var(--color-fg-muted)",
                      }}
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
