import { promises as fs } from "fs";
import path from "path";

export function getUserDataDir(): string {
  return process.env.OMNISYNC_USER_DATA_DIR || path.join(process.cwd(), "User data");
}

/**
 * Write JSON (or any text) into the user-data directory with mode 0600.
 * Re-chmods existing files so previously world-readable credential files tighten up.
 */
export async function writeUserDataFile(
  filePath: string,
  contents: string | Buffer
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, { encoding: "utf-8", mode: 0o600 });
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // Best-effort on platforms that ignore mode
  }
}

export async function writeUserDataJson(filePath: string, value: unknown): Promise<void> {
  await writeUserDataFile(filePath, JSON.stringify(value, null, 2));
}
