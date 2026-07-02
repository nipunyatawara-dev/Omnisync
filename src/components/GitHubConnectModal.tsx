"use client";

import Loader from "@/components/Loader";

interface GitHubConnectModalProps {
  phase: "authorizing" | "success";
  userCode: string;
  verificationUri: string;
  statusText: string;
  copiedCode: boolean;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  onCopyCode: () => void;
  onClose: () => void;
}

function GitHubMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export default function GitHubConnectModal({
  phase,
  userCode,
  verificationUri,
  statusText,
  copiedCode,
  username,
  displayName,
  avatarUrl,
  onCopyCode,
  onClose,
}: GitHubConnectModalProps) {
  const isSuccess = phase === "success";

  return (
    <div className="gh-connect-backdrop" role="dialog" aria-modal="true" aria-labelledby="gh-connect-title">
      <div className="gh-connect-card animate-fade-slide">
        <button
          type="button"
          className="gh-connect-close"
          onClick={onClose}
          aria-label="Close"
          disabled={isSuccess}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>

        <header className="gh-connect-header">
          <div className="gh-connect-brand">
            <GitHubMark size={22} />
          </div>
          <div>
            <h2 id="gh-connect-title" className="gh-connect-title">
              {isSuccess ? "GitHub connected" : "Authorize with GitHub"}
            </h2>
            <p className="gh-connect-subtitle">
              {isSuccess
                ? "Your account is linked — continuing to workspace setup"
                : "Enter the code below on GitHub to grant OmniSync access"}
            </p>
          </div>
        </header>

        <div className={`gh-connect-progress gh-connect-progress--${phase}`}>
          <div className="gh-connect-progress-fill" />
        </div>

        {isSuccess ? (
          <div className="gh-connect-success">
            <div className="gh-connect-success-badge" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div className="gh-connect-profile">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="gh-connect-avatar" />
              ) : (
                <div className="gh-connect-avatar gh-connect-avatar--fallback">
                  <GitHubMark size={20} />
                </div>
              )}
              <div className="gh-connect-profile-text">
                <span className="gh-connect-profile-name">{displayName || username || "GitHub user"}</span>
                {username && <span className="gh-connect-profile-handle">@{username}</span>}
              </div>
              <span className="gh-connect-status-pill">
                <span className="gh-connect-status-dot" />
                Connected
              </span>
            </div>

            <p className="gh-connect-success-note">{statusText || "Authentication complete"}</p>
          </div>
        ) : userCode ? (
          <div className="gh-connect-body">
            <button type="button" className="gh-connect-code-box" onClick={onCopyCode}>
              <span className="gh-connect-code-label">Verification code</span>
              <span className="gh-connect-code-value">{userCode}</span>
              <span className="gh-connect-code-hint">{copiedCode ? "Copied to clipboard" : "Click to copy"}</span>
            </button>

            <a
              href={verificationUri}
              target="_blank"
              rel="noreferrer"
              className="gh-connect-authorize-btn"
            >
              Open GitHub to authorize
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17 17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>

            <div className="gh-connect-waiting">
              <span className="gh-connect-waiting-pulse" aria-hidden />
              <span>{statusText || "Waiting for authorization on GitHub…"}</span>
            </div>
          </div>
        ) : (
          <div className="gh-connect-loading">
            <Loader size="md" label="Connecting to GitHub" />
            <p>{statusText || "Requesting authorization codes from GitHub…"}</p>
          </div>
        )}

        <footer className="gh-connect-footer">
          <p>Tokens are stored locally and encrypted on this machine only.</p>
        </footer>
      </div>
    </div>
  );
}
