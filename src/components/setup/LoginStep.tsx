"use client";

import { OMNISYNC_APP_ORIGIN } from "@/lib/appPort";

interface LoginStepProps {
  gitUsername: string;
  setGitUsername: (value: string) => void;
  gitToken: string;
  setGitToken: (value: string) => void;
  isPatValidating: boolean;
  onGitLogin: (e: React.FormEvent) => void;
  onGitHubSignIn: () => void;
  onSkipToProfileSelection: () => void;
  showOauthConfigForm: boolean;
  setShowOauthConfigForm: (value: boolean) => void;
  oauthConfigured: boolean | null;
  githubClientId: string;
  inputClientId: string;
  setInputClientId: (value: string) => void;
  isSavingOauthConfig: boolean;
  oauthConfigError: string;
  setOauthConfigError: (value: string) => void;
  onSaveOauthConfig: (e: React.FormEvent) => void;
}

export default function LoginStep({
  gitUsername,
  setGitUsername,
  gitToken,
  setGitToken,
  isPatValidating,
  onGitLogin,
  onGitHubSignIn,
  onSkipToProfileSelection,
  showOauthConfigForm,
  setShowOauthConfigForm,
  oauthConfigured,
  githubClientId,
  inputClientId,
  setInputClientId,
  isSavingOauthConfig,
  oauthConfigError,
  setOauthConfigError,
  onSaveOauthConfig,
}: LoginStepProps) {
  return (
    <>
      <div className="w-full md:w-[400px] p-xl bg-surface-container flex flex-col border-b md:border-b-0 md:border-r border-outline-variant shrink-0 animate-fade-in">
        <div className="flex items-center gap-sm mb-lg">
          <img src="/icon.png" alt="Logo" style={{ height: "24px", width: "24px", objectFit: "contain", borderRadius: "4px" }} />
          <span className="font-headline-sm text-headline-sm tracking-tight text-on-surface">OmniSync</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-md">The Local Deck for GitHub</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-xl">
          Integrate code editing, terminal execution, live background logs, and visual merge resolution in a single local workspace control center.
        </p>
        <div className="flex flex-col gap-lg flex-grow overflow-y-auto pr-sm custom-scrollbar">
          <div className="flex items-start gap-md">
            <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center feature-icon-bg border border-outline-variant">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary-container">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </div>
            <div>
              <h3 className="font-button-text text-button-text text-on-surface mb-xs">Integrated Code Viewer</h3>
              <p className="font-body-md text-on-surface-variant text-[13px] leading-relaxed">Inspect repository folders, switch branches, and track commits.</p>
            </div>
          </div>
          <div className="flex items-start gap-md">
            <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center feature-icon-bg border border-outline-variant">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary-container">
                <circle cx="18" cy="18" r="3" />
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 15V9a4 4 0 0 0-4-4H9" />
                <line x1="6" y1="9" x2="6" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="font-button-text text-button-text text-on-surface mb-xs">Three-Pane Conflict Resolver</h3>
              <p className="font-body-md text-on-surface-variant text-[13px] leading-relaxed">Resolve merges interactively without complex terminal inputs.</p>
            </div>
          </div>
          <div className="flex items-start gap-md">
            <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center feature-icon-bg border border-outline-variant">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary-container">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div>
              <h3 className="font-button-text text-button-text text-on-surface mb-xs">Deterministic Scanner</h3>
              <p className="font-body-md text-on-surface-variant text-[13px] leading-relaxed">Verify package integrity and execute safe cache repairs.</p>
            </div>
          </div>
        </div>
        <div className="mt-xl pt-md border-t border-outline-variant shrink-0">
          <p className="font-label-mono text-label-mono text-on-surface-variant">Verifying active environment configuration on startup.</p>
        </div>
      </div>

      <div className="w-full flex-1 bg-background flex flex-col overflow-hidden">
        <div style={{ flex: 1, overflowY: "auto", padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <div className="w-full max-w-[500px] animate-fade-slide">
            {!showOauthConfigForm ? (
              <div>
                <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">Connect Account</h2>
                <p className="font-body-lg text-body-lg text-on-surface-variant mb-xl">
                  Authorize OmniSync to sync remote branches and workspace settings.
                </p>
                <button
                  type="button"
                  onClick={onGitHubSignIn}
                  className="w-full btn-secondary rounded-lg py-md px-md flex items-center justify-center gap-sm font-button-text text-button-text mb-sm transition-colors cursor-pointer"
                >
                  <svg aria-hidden="true" className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path clipRule="evenodd" d="M12 2C6.477 2 2 6.463 2 11.97c0 4.404 2.865 8.14 6.839 9.458.5.092.682-.216.682-.48 0-.236-.008-.864-.013-1.695-2.782.602-3.369-1.337-3.369-1.337-.454-1.151-1.11-1.458-1.11-1.458-.908-.618.069-.606.069-.606 1.003.07 1.531 1.027 1.531 1.027.892 1.524 2.341 1.084 2.91.828.092-.643.35-1.083.636-1.332-2.22-.251-4.555-1.107-4.555-4.927 0-1.088.39-1.979 1.029-2.675-.103-.252-.446-1.266.098-2.638 0 0 .84-.268 2.75 1.022A9.606 9.606 0 0112 6.82c.85.004 1.705.114 2.504.336 1.909-1.29 2.747-1.022 2.747-1.022.546 1.372.202 2.386.1 2.638.64.696 1.028 1.587 1.028 2.675 0 3.83-2.339 4.673-4.566 4.92.359.307.678.915.678 1.846 0 1.332-.012 2.407-.012 2.734 0 .267.18.577.688.48C19.137 20.107 22 16.373 22 11.969 22 6.463 17.522 2 12 2z" fillRule="evenodd"></path>
                  </svg>
                  Sign in with GitHub
                </button>

                <div className="flex justify-center mb-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setInputClientId(githubClientId);
                      setShowOauthConfigForm(true);
                    }}
                    className="text-xs text-on-surface-variant hover:text-secondary-container underline bg-transparent border-0 cursor-pointer"
                  >
                    {oauthConfigured ? "Reconfigure GitHub OAuth App" : "Configure Custom GitHub OAuth App"}
                  </button>
                </div>

                <div className="relative flex items-center py-sm mb-xl">
                  <div className="flex-grow border-t border-outline-variant"></div>
                  <span className="flex-shrink-0 mx-4 font-label-mono text-label-mono text-on-surface-variant uppercase tracking-wider text-[10px]">
                    Or use personal access token
                  </span>
                  <div className="flex-grow border-t border-outline-variant"></div>
                </div>

                <form onSubmit={onGitLogin}>
                  <div className="flex flex-col gap-lg mb-xl">
                    <div>
                      <label className="block font-button-text text-button-text text-on-surface mb-sm" htmlFor="username">
                        GitHub Username
                      </label>
                      <input
                        id="username"
                        type="text"
                        className="w-full input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow"
                        value={gitUsername}
                        onChange={(e) => setGitUsername(e.target.value)}
                        placeholder="octocat"
                        required
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-sm">
                        <label className="block font-button-text text-button-text text-on-surface" htmlFor="token">
                          Personal Access Token
                        </label>
                        <a
                          href="https://github.com/settings/tokens"
                          target="_blank"
                          rel="noreferrer"
                          className="font-button-text text-[12px] text-secondary-container hover:underline"
                        >
                          Generate
                        </a>
                      </div>
                      <input
                        id="token"
                        type="password"
                        className="w-full input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow tracking-[0.2em] font-mono"
                        value={gitToken}
                        onChange={(e) => setGitToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxx"
                      />
                      <p className="font-body-md text-[12px] text-on-surface-variant mt-sm">
                        Required for GitHub clone and sync features. Leave blank to continue in local-only mode.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-md">
                    <button
                      type="button"
                      onClick={onSkipToProfileSelection}
                      className="w-1/3 btn-secondary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
                    >
                      Sign in Later
                    </button>
                    <button
                      type="submit"
                      disabled={isPatValidating}
                      className="w-2/3 btn-primary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
                    >
                      {isPatValidating
                        ? "Validating..."
                        : gitToken.trim()
                          ? "Authorize & Sign In"
                          : "Continue in Local Mode"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="animate-fade-slide">
                <h2 className="font-headline-lg text-headline-lg text-on-surface mb-xs">Configure Custom Client ID</h2>
                <p className="font-body-lg text-body-lg text-on-surface-variant mb-lg">
                  Link your own GitHub Application to customize the branding on the authorization page.
                </p>

                <div className="border border-outline-variant rounded-xl p-md bg-surface-container/50 mb-xl text-[13px] text-on-surface-variant flex flex-col gap-sm">
                  <div className="font-semibold text-on-surface mb-xs">Setup Instructions:</div>
                  <div>
                    1. Open the{" "}
                    <a
                      href="https://github.com/settings/applications/new"
                      target="_blank"
                      rel="noreferrer"
                      className="text-secondary-container hover:underline font-medium"
                    >
                      GitHub Register Application page
                    </a>{" "}
                    in a new tab.
                  </div>
                  <div>
                    2. Set the following fields in GitHub:
                    <div className="mt-xs pl-sm border-l-2 border-outline-variant flex flex-col gap-xs font-mono text-[11px] bg-background/50 p-xs rounded">
                      <div>Application Name: <span className="text-on-surface">OmniSync (Local)</span></div>
                      <div>Homepage URL: <span className="text-on-surface">{typeof window !== "undefined" ? window.location.origin : OMNISYNC_APP_ORIGIN}</span></div>
                      <div>Authorization Callback URL: <span className="text-on-surface">{typeof window !== "undefined" ? window.location.origin : OMNISYNC_APP_ORIGIN}/api/auth/callback/github</span></div>
                    </div>
                  </div>
                  <div>
                    3. Register the application, and on the App settings page, make sure to check **Enable Device Flow**.
                  </div>
                  <div>
                    4. Copy the public <span className="font-semibold text-on-surface">Client ID</span> and paste it below (no Client Secret is needed for Device Flow).
                  </div>
                </div>

                <form onSubmit={onSaveOauthConfig}>
                  <div className="flex flex-col gap-lg mb-xl">
                    <div>
                      <label className="block font-button-text text-button-text text-on-surface mb-sm" htmlFor="clientId">
                        Client ID
                      </label>
                      <input
                        id="clientId"
                        type="text"
                        className="w-full input-surface rounded-md px-md py-sm text-on-surface font-body-md transition-shadow font-mono"
                        value={inputClientId}
                        onChange={(e) => setInputClientId(e.target.value)}
                        placeholder="e.g. Iv1.1234567890abcdef"
                        required
                      />
                    </div>
                  </div>

                  {oauthConfigError && (
                    <div className="flash flash-danger text-[12px] mb-lg py-xs px-sm rounded">
                      {oauthConfigError}
                    </div>
                  )}

                  <div className="flex gap-md">
                    <button
                      type="button"
                      onClick={() => {
                        setShowOauthConfigForm(false);
                        setOauthConfigError("");
                      }}
                      className="w-1/3 btn-secondary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingOauthConfig}
                      className="w-2/3 btn-primary rounded-lg py-sm px-md font-button-text text-button-text transition-colors cursor-pointer"
                    >
                      {isSavingOauthConfig ? "Saving & Connecting..." : "Save & Authenticate"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
