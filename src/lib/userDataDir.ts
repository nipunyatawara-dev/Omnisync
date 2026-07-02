import path from "path";

export function getUserDataDir(): string {
  return process.env.OMNISYNC_USER_DATA_DIR || path.join(process.cwd(), "User data");
}
