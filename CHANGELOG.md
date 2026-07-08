# Changelog

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
