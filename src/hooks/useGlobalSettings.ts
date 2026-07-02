"use client";

import { useState, useEffect, useCallback } from "react";
import { applyAccentTheme } from "@/lib/accentTheme";
import type { AccentColor, GlobalSettings } from "@/lib/globalSettingsTypes";
import { DEFAULT_GLOBAL_SETTINGS } from "@/lib/globalSettingsTypes";
import {
  readGlobalSettingsFromLocalStorage,
  syncGlobalSettingsToLocalStorage,
} from "@/lib/globalSettingsClient";

export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalSettings>({ ...DEFAULT_GLOBAL_SETTINGS });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          const merged = { ...DEFAULT_GLOBAL_SETTINGS, ...data.settings };
          setSettings(merged);
          syncGlobalSettingsToLocalStorage(merged);
          applyAccentTheme((merged.accentColor || "default") as AccentColor);
          return;
        }
      }
    } catch {
      // Fall back to cached values below
    }

    const cached = readGlobalSettingsFromLocalStorage();
    setSettings(cached);
    applyAccentTheme((cached.accentColor || "default") as AccentColor);
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  const updateField = useCallback(<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (key === "accentColor") {
      applyAccentTheme(value as AccentColor);
    }
  }, []);

  const save = useCallback(async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage({ type: "error", text: data.error || "Failed to save settings." });
        return false;
      }

      const saved = { ...DEFAULT_GLOBAL_SETTINGS, ...data.settings };
      setSettings(saved);
      syncGlobalSettingsToLocalStorage(saved);
      applyAccentTheme((saved.accentColor || "default") as AccentColor);
      setMessage({ type: "success", text: "Global settings saved successfully." });
      return true;
    } catch {
      setMessage({ type: "error", text: "Failed to save settings." });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  return {
    settings,
    isLoading,
    isSaving,
    message,
    setMessage,
    updateField,
    save,
    reload: load,
  };
}
