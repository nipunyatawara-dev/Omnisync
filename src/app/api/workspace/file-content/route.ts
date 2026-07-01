import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getActiveProfile } from "@/lib/profiles";

export async function GET(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const relativeFile = searchParams.get("file");
  if (!relativeFile) {
    return NextResponse.json({ error: "File path parameter missing" }, { status: 400 });
  }

  try {
    const rootPath = path.resolve(profile.workspacePath);
    const absolutePath = path.resolve(rootPath, relativeFile);
    
    // Check for path traversal
    if (!absolutePath.startsWith(rootPath + path.sep) && absolutePath !== rootPath) {
      return NextResponse.json({ error: "Access denied: Invalid file path" }, { status: 403 });
    }

    const content = await fs.readFile(absolutePath, "utf-8");
    return NextResponse.json({ content });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const profile = await getActiveProfile();
  if (!profile || !profile.workspacePath) {
    return NextResponse.json({ error: "No active workspace path" }, { status: 400 });
  }

  try {
    const { file, content } = await request.json();
    if (!file) {
      return NextResponse.json({ error: "File parameter missing" }, { status: 400 });
    }

    const rootPath = path.resolve(profile.workspacePath);
    const absolutePath = path.resolve(rootPath, file);

    // Check for path traversal
    if (!absolutePath.startsWith(rootPath + path.sep) && absolutePath !== rootPath) {
      return NextResponse.json({ error: "Access denied: Invalid file path" }, { status: 403 });
    }

    await fs.writeFile(absolutePath, content, "utf-8");
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
