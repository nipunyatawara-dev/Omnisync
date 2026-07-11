# OmniSync security model

OmniSync is a **local desktop application**. It binds its API to localhost and assumes the machine user is trusted. Treat a stolen API cookie or local malware as full access to configured workspaces and shell surfaces.

## Trust boundary

| Surface | Protection |
| --- | --- |
| HTTP API (`/api/*`) | HttpOnly `omnisync_token` cookie + localhost host/origin checks |
| GitHub tokens | AES-256-GCM at rest (per-install salt); never returned to the browser after auth |
| Profile passwords | scrypt one-way hashes |
| Encryption master secret | OS keychain via Electron `safeStorage` in packaged builds |
| Workspace file/git ops | Restricted to registered workspace paths with symlink containment |
| Clone destinations | Must be under the user home directory or a registered workspace parent |

## Shell surfaces

The dashboard terminal, diagnostics repairs (`npm install`, cache clean, etc.), and profile `runCommand` / `buildCommand` execute **as your user with full shell access**. OmniSync shows a confirmation before first terminal use and before diagnostics maintenance actions. Do not run OmniSync on a shared account if other local users are untrusted.

## What a compromised API cookie means

Anyone who can call `localhost` with a valid `omnisync_token` can:

- Read/write files in registered workspaces
- Run git and shell commands configured in the UI
- Use stored GitHub credentials for API and clone operations

The token is generated per Electron session and is not written to disk.

## Unsupported secure modes

- Bare `next dev` / `next start` without Electron does not provision the API cookie automatically. Prefer `npm run electron` for normal use.
- Packaged builds refuse to start if OS keychain encryption is unavailable (plaintext secret storage is allowed only in development).

## Reporting issues

Please open a private security advisory or contact the maintainers via the repository.
