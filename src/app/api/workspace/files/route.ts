import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getActiveProfile } from "@/lib/profiles";
import { getGlobalSettings } from "@/lib/globalSettings";
import { resolveSafePath, PathAccessError } from "@/lib/pathSafety";

export interface FileNode {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  children?: FileNode[];
}

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".idea",
  ".vscode",
  "User data",
]);

/** List a single directory (lazy tree). `relativeDir` empty = workspace root. */
async function listDirectory(
  rootPath: string,
  relativeDir: string,
  showHiddenFiles: boolean
): Promise<FileNode[]> {
  const dirPath = relativeDir
    ? await resolveSafePath(rootPath, relativeDir)
    : path.resolve(rootPath);

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (!showHiddenFiles && entry.name.startsWith(".")) continue;

    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
    nodes.push({
      name: entry.name,
      relativePath: relativePath.split(path.sep).join("/"),
      isDirectory: entry.isDirectory(),
    });
  }

  return nodes.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function GET(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active profile or workspace configured" }, { status: 400 });
  }

  try {
    const rootPath = path.resolve(profile.workspacePath);
    const { showHiddenFiles } = await getGlobalSettings();
    const url = new URL(request.url);
    const relativeDir = (url.searchParams.get("path") || "").replace(/^\/+/, "");

    const children = await listDirectory(rootPath, relativeDir, showHiddenFiles);
    return NextResponse.json({
      children,
      path: relativeDir,
      rootPath,
      showHiddenFiles,
    });
  } catch (err: unknown) {
    if (err instanceof PathAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[files] failed to list directory:", err);
    return NextResponse.json({ error: "Failed to read workspace files" }, { status: 500 });
  }
}
