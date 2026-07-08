import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_GLOBAL_SETTINGS,
  type GlobalSettings,
  autoFetchIntervalMs,
} from "@/lib/globalSettingsTypes";
import { getUserDataDir } from "@/lib/userDataDir";

export type { AccentColor, GlobalSettings } from "@/lib/globalSettingsTypes";
export { DEFAULT_GLOBAL_SETTINGS, autoFetchIntervalMs } from "@/lib/globalSettingsTypes";

const USER_DATA_DIR = getUserDataDir();
const SETTINGS_FILE = path.join(USER_DATA_DIR, "global-settings.json");

async function ensureDir() {
  await fs.mkdir(USER_DATA_DIR, { recursive: true });
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  try {
    await ensureDir();
    const raw = await fs.readFile(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    delete parsed.enableTelemetry;
    return { ...DEFAULT_GLOBAL_SETTINGS, ...parsed };
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "ENOENT") {
      return { ...DEFAULT_GLOBAL_SETTINGS };
    }
    console.error("[globalSettings] read failed:", error);
    return { ...DEFAULT_GLOBAL_SETTINGS };
  }
}

export async function hasPersistedGlobalSettings(): Promise<boolean> {
  try {
    await fs.access(SETTINGS_FILE);
    return true;
  } catch {
    return false;
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
