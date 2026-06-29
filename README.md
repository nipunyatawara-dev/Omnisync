# OmniSync - Workspace Flow & Context Summary

This file serves as a reference manual for coding agents to understand the system architecture, file structures, state flows, and layout configurations.

## System Architecture & State Hydration
1. On mount, `/` (Dashboard) queries `/api/profiles` for user profiles and the active workspace configuration.
2. If `activeProfileId` is undefined or no profiles are present, the router redirects to `/setup`.
3. If a workspace is active, the app loads profile details (containing `workspacePath`) and populates state via the following endpoints:
   - `/api/workspace/files`: Scans project files and constructs the file tree.
   - `/api/workspace/git?action=branches`: Retrieves git branch list.
   - `/api/workspace/git?action=status`: Fetches ahead/behind commits count against remote upstream.
   - `/api/workspace/git?action=conflicts`: Scans for files containing git merge conflict markers (`<<<<<<<`).
   - `/api/workspace/diagnostics`: Verifies engine compatibility and runs checks.

## Router Pages & Wizard Steps (`/setup`)
- **Step 1: Account Login (`login`)**: Setup connection via simulated OAuth or username inputs. Bypassed automatically if existing profiles exist on the machine.
- **Step 2: Workspace Select (`profile-selection`)**: A grid displaying all configured local workspace folders. Displays a "+" card to register a new workspace.
- **Step 3: Setup Mode (`repo-selection`)**: Toggles between:
  - **GitHub setup**: Clones a remote repository to a local path.
  - **Local setup**: Scans and registers an existing local path manually.
  Both setup options create a new user profile record, make it the active session profile, and redirect back to the home dashboard (`/`).

## Tab View Switchers
Inside the active workspace dashboard (`/`), the sidebar routes the client view across:
- **Workspace Code Tab (`activeTab === "workspace"`)**:
  - File tree on the left, Resizer dividers, central tabbed Editor (Markdown rendered if `.md` extension, raw text otherwise).
  - Resizable right Git column displaying the file commit history timeline and the line diff analyzer.
  - Compiler runner console showing live stdout/stderr compiler logs.
- **Git Conflicts Resolver Tab (`activeTab === "git"`)**:
  - Displays files with merge conflicts. Clicking one opens the interactive three-pane conflict resolver (Current changes, Incoming changes, and final output compiler).
- **Diagnostics Scanner Tab (`activeTab === "diagnostics"`)**:
  - Displays environment warnings, Node compatibility flags, and missing dependencies, offering direct triggers for package fixes.
- **Workspace Settings Tab (`activeTab === "settings"`)**:
  - Form variables to update the local directory path, branch protection rules, auto fetch settings, and custom development script lines.
  - Danger Zone: Disconnects the project, deletes the profile from disk, and routes the user back to the workspace selection list.
