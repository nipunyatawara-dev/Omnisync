import path from "path";
import os from "os";
import { promises as fs } from "fs";
import { getProfiles } from "@/lib/profiles";

function isPathInside(parent: string, candidate: string): boolean {
  const rel = path.relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Clone targets must live under the user's home directory or under a
 * registered profile workspace parent (after realpath resolution).
 */
export async function assertAllowedClonePath(localPath: string): Promise<string> {
  if (!path.isAbsolute(localPath)) {
    throw new Error("localPath must be an absolute path");
  }

  const resolved = path.resolve(localPath);
  const home = path.resolve(os.homedir());
  let realHome = home;
  try {
    realHome = await fs.realpath(home);
  } catch {
    realHome = home;
  }

  let realTarget = resolved;
  try {
    realTarget = await fs.realpath(resolved);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      const parent = path.dirname(resolved);
      try {
        const realParent = await fs.realpath(parent);
        realTarget = path.join(realParent, path.basename(resolved));
      } catch {
        // Parent may not exist yet — use resolved path for containment check
        realTarget = resolved;
      }
    } else {
      throw err;
    }
  }

  if (isPathInside(realHome, realTarget) || isPathInside(home, realTarget)) {
    return realTarget;
  }

  const profiles = await getProfiles();
  for (const profile of profiles) {
    if (!profile.workspacePath) continue;
    const workspaceRoot = path.resolve(profile.workspacePath);
    let realWorkspace = workspaceRoot;
    try {
      realWorkspace = await fs.realpath(workspaceRoot);
    } catch {
      realWorkspace = workspaceRoot;
    }
    const workspaceParent = path.dirname(realWorkspace);
    if (isPathInside(workspaceParent, realTarget) || isPathInside(realWorkspace, realTarget)) {
      return realTarget;
    }
  }

  throw new Error("Clone path must be under your home directory or a registered workspace");
}
