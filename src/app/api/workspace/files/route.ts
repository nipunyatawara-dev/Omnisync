import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getActiveProfile } from "@/lib/profiles";

interface FileNode {
  name: string;
  relativePath: string;
  absolutePath: string;
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

async function buildFileTree(
  dirPath: string,
  rootPath: string,
  depth = 0,
  maxDepth = 15,
  visited = new Set<string>()
): Promise<FileNode[]> {
  const resolvedPath = path.resolve(dirPath);
  if (depth > maxDepth || visited.has(resolvedPath)) {
    return [];
  }
  
  // Clone visited set to pass down the tree branch (prevents cross-sibling pollution)
  const currentVisited = new Set(visited);
  currentVisited.add(resolvedPath);

  try {
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(resolvedPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      const node: FileNode = {
        name: entry.name,
        relativePath,
        absolutePath: fullPath,
        isDirectory: entry.isDirectory(),
      };

      if (node.isDirectory) {
        node.children = await buildFileTree(fullPath, rootPath, depth + 1, maxDepth, currentVisited);
      }

      nodes.push(node);
    }

    return nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export async function GET() {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active profile or workspace configured" }, { status: 400 });
  }

  try {
    const rootPath = path.resolve(profile.workspacePath);
    const tree = await buildFileTree(rootPath, rootPath, 0, 15, new Set<string>());
    return NextResponse.json({ tree, rootPath });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
