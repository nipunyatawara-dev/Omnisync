<p align="center">
  <img src="public/icon.png" alt="OmniSync logo" width="120" />
</p>

# OmniSync

[![Version](https://img.shields.io/badge/version-0.1b-blue)](https://github.com/nipunyatawara-dev/Omnisync)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/nipunyatawara-dev/Omnisync)
[![Stack](https://img.shields.io/badge/stack-Electron%20%2B%20Next.js-black)](https://github.com/nipunyatawara-dev/Omnisync)

---

### Get started

* [Latest release](https://github.com/nipunyatawara-dev/Omnisync/releases/latest)
* [Clone & run from source](#development)

---

**OmniSync** is a desktop workspace launcher and sync dashboard for local and GitHub-backed repositories — built with Electron and Next.js.

* Multi-workspace profiles with one-click switching
* Clone from GitHub or register an existing local folder
* Integrated file tree, tabbed editor, and Markdown preview
* Git branch switcher with ahead/behind sync status
* Three-pane merge conflict resolver
* Environment diagnostics (Node engines, dependencies, git health)
* Built-in dev server runner with live stdout/stderr
* Launch targets: browser, Electron shell, Xcode, and popular IDEs
* Encrypted credential storage via the OS keychain

# Contents

- [What OmniSync is and isn't](#what-omnisync-is-and-isnt)
- [Setup wizard](#setup-wizard)
- [Workspace](#workspace)
- [Git sync & conflicts](#git-sync--conflicts)
- [Diagnostics](#diagnostics)
- [Dev runner](#dev-runner)
- [Development](#development)
- [Architecture](#architecture)
- [Contributing](#contributing)

# What OmniSync is and isn't

* **OmniSync is** a workspace hub that connects your local repositories, Git remotes, and development tooling into one desktop dashboard.

* **OmniSync is not** a full IDE or a replacement for Git on the command line. It orchestrates your workspace — it doesn't replace your editor of choice. Use it alongside Cursor, VS Code, Xcode, or IntelliJ.

# Setup wizard

On first launch, OmniSync walks you through a short setup flow at `/setup`:

1. **Account login** — Connect via GitHub OAuth or a personal access token. Skipped automatically if profiles already exist on this machine.
2. **Workspace select** — Pick from configured local workspaces or add a new one with the **+** card.
3. **Setup mode** — Choose one of two paths:
   - **GitHub** — Clone a remote repository to a local path.
   - **Local** — Point OmniSync at an existing folder on disk.

Both paths create a profile, set it as the active session, and redirect to the dashboard.

# Workspace

The main dashboard (`/`) is organized around a sidebar with five views:

| Tab | What it does |
| --- | --- |
| **Workspace** | File tree, resizable editor panes, git history column, and line diff viewer |
| **Git Sync** | Branch list, upstream status, and the conflict resolver |
| **Diagnostics** | Environment audits and one-click dependency repairs |
| **Timeline** | Repository commit calendar and history |
| **Settings** | Workspace path, branch protection, auto-fetch, and custom run scripts |

**Workspace view** highlights:

* Browse and open files from a live-scanned project tree
* File viewer with Markdown rendering for `.md` files
* Resizable panels — drag dividers to fit your layout
* Commit timeline and per-file diff analysis in the right column

# Git sync & conflicts

OmniSync keeps you oriented relative to your remote:

* Lists local and remote branches
* Shows commits **ahead** and **behind** upstream
* Scans for merge conflict markers (`<<<<<<<`)

When conflicts are found, the **Git Sync** tab opens an interactive three-pane resolver:

* **Current** (yours) on the left
* **Incoming** (theirs) on the right
* **Result** in the center — accept blocks individually to build the resolved file

# Diagnostics

The diagnostics scanner verifies your workspace is ready to run:

* Node.js version vs. `engines.node` in `package.json`
* Missing `node_modules` dependencies
* Git repository health
* Project metadata (name, version, license)

Warnings surface actionable fixes — including triggers to install missing packages.

# Dev runner

Start, stop, and monitor development servers from the dashboard:

* Live **stdout** / **stderr** in the runner console
* Configurable `runCommand` and `buildCommand` per workspace
* Launch the running app in a browser, Electron wrapper, or native IDE once the server is up

# Development

### Prerequisites

* Node.js 20+
* npm

### Run locally

```bash
git clone https://github.com/nipunyatawara-dev/Omnisync.git
cd Omnisync
npm install
npm run dev        # Next.js dev server
npm run electron   # Electron shell (separate terminal)
```

### Build

```bash
npm run build
npm start
```

Profile data, encrypted secrets, and workspace configuration are stored under `User data/` in the project root.

### Package for distribution

```bash
npm run build
npm run electron:pack    # unpacked app in dist/
npm run electron:build   # platform installers (.dmg, .exe, .AppImage)
```

### Tests

```bash
npm test
```

# Architecture

OmniSync is a three-layer desktop app:

```
Electron shell (main.js)
    └── spawns Next.js on localhost:47821
            └── React dashboard (src/app/)
                    └── API routes (src/app/api/)
                            └── lib helpers (src/lib/)
                                    └── filesystem + git + child processes
```

| Layer | Key files | Responsibility |
| --- | --- | --- |
| **Shell** | `main.js`, `preload.js` | Window, API token cookie, encryption secret, directory picker IPC |
| **UI** | `src/app/page.tsx`, `src/components/views/` | Dashboard tabs: workspace, git sync, diagnostics, timeline, settings |
| **API** | `src/app/api/workspace/*`, `src/middleware.ts` | Auth-guarded routes for git, files, runner, launch, diagnostics |
| **Core** | `src/lib/git.ts`, `profiles.ts`, `pathSafety.ts`, `platformLaunch.ts` | Git ops, encrypted profiles, safe paths, cross-platform IDE launch |

**Security model:** Electron generates a per-session API token and encryption secret. Middleware requires a matching HttpOnly cookie on `/api/*` from localhost only. Profile tokens are encrypted at rest with AES-256-GCM.

**Data flow (git sync):** UI → `POST /api/workspace/git` → `src/lib/git.ts` → system `git` binary → JSON response → dashboard state via `useGitSync` hook.

# Contributing

Pull requests are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Push and open a pull request

Please keep changes focused and match the existing code style.

---


> **Cursor Composer 2.5 Flash** and **Gemini 3.5 Flash** models were used for development support. 
> 
> This is a **Beta software** . Feedback and bug reports are welcome via [GitHub Issues](https://github.com/nipunyatawara-dev/Omnisync/issues).
