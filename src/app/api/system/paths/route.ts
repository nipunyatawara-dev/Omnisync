import { NextResponse } from "next/server";
import os from "os";
import path from "path";

export async function GET() {
  const homeDir = os.homedir();
  let username = "user";
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER || process.env.USERNAME || "user";
  }

  const defaultCloneParent = path.join(homeDir, "Documents", "GitHub");

  return NextResponse.json({
    homeDir,
    username,
    defaultCloneParent,
  });
}
