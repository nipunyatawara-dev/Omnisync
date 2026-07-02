import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { getActiveProfile } from "@/lib/profiles";
import { resolveSafePath, PathAccessError } from "@/lib/pathSafety";

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
    const realPath = await resolveSafePath(profile.workspacePath, relativeFile);
    const content = await fs.readFile(realPath, "utf-8");
    return NextResponse.json({ content });
  } catch (err: unknown) {
    if (err instanceof PathAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[file-content] read failed:", err);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
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

    const realPath = await resolveSafePath(profile.workspacePath, file);
    await fs.writeFile(realPath, content, "utf-8");
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof PathAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[file-content] write failed:", err);
    return NextResponse.json({ error: "Failed to write file" }, { status: 500 });
  }
}
