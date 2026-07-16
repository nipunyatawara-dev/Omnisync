# Changelog

## 0.4b

### Added
- Remote branches listed after clone (local + remote-tracking), with checkout that creates a tracking branch
- Collaboration feed tags every commit with all branches that contain it
- Workspace-scoped Git settings inside an open workspace; global Git defaults only from the select-workspace Settings page
- GitHub Releases and Deployments in Environment Diagnostics Project Specifications (when the repo has them)
- Clickable Dependencies Check tile with installed/missing package list
- Project description fallback from GitHub repo description, then README
- Setup-page developer tools prompt for Node.js, Git, and GitHub CLI with in-app install

### Fixed
- Remote-only branches (e.g. `dev`) missing from branch pickers after clone
- Deleting a non-active workspace sending the app back to workspace selection
- Settings panel failing to render when opened from the dashboard
- Tools prompt falsely reporting Node/Git/gh as missing when already installed
- Calendar details panel instructional placeholder text

### Changed
- Dependencies status badge copy (“Dependencies clean” instead of `node_modules`)
- Removed status indicator dot next to Environment Diagnostics title
- Git identity and sync behavior copy clarified for global vs per-workspace settings


## 0.3b

### Added
- Dashboard terminal with live output from diagnostics, git, and runner ops, plus manual command entry
- Contribution heatmap on the Timeline view
- Image previews in CodeViewer (PNG, GIF, JPG, WebP, BMP, ICO, SVG, AVIF)
- Runner prepare/build step before start (default `npm run build`)
- Isolated workspace child process env (`buildWorkspaceChildEnv`)

### Fixed
- PORT env leak into other Next.js apps during development
- Workspace child env pollution breaking `next dev` / Turbopack
- Duplicate Electron IPC handler registration on window reopen
- macOS Dock reopen racing a cold Next.js restart
- Tooltips clipping outside the viewport
- Binary/image files being read as UTF-8 text in CodeViewer

### Changed
- Electron main window lifecycle (`launchMainWindow`, restore/focus existing window)
- App port reads `NEXT_PUBLIC_OMNISYNC_PORT` only (default `47821`)
- Viewport-aware tooltip positioning


## 0.2b

### Security
- Workspace path allowlist on launch API (`resolveWorkspaceCwd`)
- File read/write size limits (2 MB) on file-content API
- Stop logging API tokens to stdout in development middleware

### Architecture
- Split dashboard into `WorkspaceView`, `DiagnosticsView`, `TimelineView`, `DashboardShell`
- Split setup wizard into step components with `useGithubOAuth` hook
- Split `globals.css` into style partials under `src/app/styles/`

### Testing & CI
- GitHub Actions workflow: lint, test, build
- API route tests for launch, file-content, middleware
- Vitest coverage configuration
- Playwright smoke test for setup page

### Cleanup
- Removed unused `enableTelemetry` setting from global settings

### UX & performance
- Sidebar tab accessibility (`role="tablist"`, `aria-selected`)
- Virtualized file tree for large repositories
- Structured logger for API routes
- Surface git branch/conflict load errors in UI

### Docs
- Added LICENSE (MIT), `.env.example`, and platform support notes
