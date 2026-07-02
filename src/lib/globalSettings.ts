import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_GLOBAL_SETTINGS,
  type GlobalSettings,
  autoFetchIntervalMs,
} from "@/lib/globalSettingsTypes";

export type { AccentColor, GlobalSettings } from "@/lib/globalSettingsTypes";
export { DEFAULT_GLOBAL_SETTINGS, autoFetchIntervalMs } from "@/lib/globalSettingsTypes";

const USER_DATA_DIR = path.join(process.cwd(), "User data");
const SETTINGS_FILE = path.join(USER_DATA_DIR, "global-settings.json");

async function ensureDir() {
  await fs.mkdir(USER_DATA_DIR, { recursive: true });
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  try {
    await ensureDir();
    const raw = await fs.readFile(SETTINGS_FILE, "utf-8");
    return { ...DEFAULT_GLOBAL_SETTINGS, ...JSON.parse(raw) };
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "ENOENT") {
      return { ...DEFAULT_GLOBAL_SETTINGS };
    }
    console.error("[globalSettings] read failed:", error);
    return { ...DEFAULT_GLOBAL_SETTINGS };
  }
}

export async function saveGlobalSettings(
  updates: Partial<GlobalSettings>
): Promise<GlobalSettings> {
  const current = await getGlobalSettings();
  const merged = { ...current, ...updates };
  await ensureDir();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}
