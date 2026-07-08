import path from "path";
import { getActiveProfile, getProfiles } from "@/lib/profiles";

export type WorkspaceCwdResult =
  | { cwd: string }
  | { error: string; status: number };

function normalizeWorkspacePath(workspacePath: string): string {
  const resolved = path.resolve(workspacePath);
  if (process.platform === "win32") {
    return resolved.toLowerCase();
  }
  return resolved;
}

async function getAllowedWorkspacePaths(): Promise<string[]> {
  const profiles = await getProfiles();
  return profiles
    .map((profile) => profile.workspacePath)
    .filter((workspacePath): workspacePath is string => Boolean(workspacePath))
    .map(normalizeWorkspacePath);
}

export async function resolveWorkspaceCwd(
  requestedPath?: string
): Promise<WorkspaceCwdResult> {
  if (!requestedPath) {
    const profile = await getActiveProfile();
    if (!profile?.workspacePath) {
      return { error: "No workspace path", status: 400 };
    }
    return { cwd: profile.workspacePath };
  }

  const normalized = normalizeWorkspacePath(requestedPath);
  const allowed = await getAllowedWorkspacePaths();

  if (!allowed.includes(normalized)) {
    return { error: "Workspace path not in allowlist", status: 403 };
  }

  return { cwd: path.resolve(requestedPath) };
}
