import { promises as fs } from "fs";
import path from "path";

export class PathAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathAccessError";
  }
}

/** Resolve a relative path within a workspace root with symlink containment checks. */
export async function resolveSafePath(
  workspaceRoot: string,
  relativePath: string
): Promise<string> {
  if (!relativePath || typeof relativePath !== "string") {
    throw new PathAccessError("File path parameter missing");
  }

  const rootPath = path.resolve(workspaceRoot);
  const absolutePath = path.resolve(rootPath, relativePath);

  if (!absolutePath.startsWith(rootPath + path.sep) && absolutePath !== rootPath) {
    throw new PathAccessError("Access denied: Invalid file path");
  }

  const realRoot = await fs.realpath(rootPath);
  let realPath: string;
  try {
    realPath = await fs.realpath(absolutePath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      const parent = path.dirname(absolutePath);
      const realParent = await fs.realpath(parent);
      if (!realParent.startsWith(realRoot + path.sep) && realParent !== realRoot) {
        throw new PathAccessError("Access denied: Invalid file path");
      }
      realPath = path.join(realParent, path.basename(absolutePath));
      if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) {
        throw new PathAccessError("Access denied: Invalid file path");
      }
      return realPath;
    }
    throw err;
  }

  if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) {
    throw new PathAccessError("Access denied: Invalid file path");
  }

  return realPath;
}
