"use client";

import { useEffect } from "react";
import { applyAccentTheme } from "@/lib/accentTheme";
import type { AccentColor } from "@/lib/globalSettingsTypes";
import { syncGlobalSettingsToLocalStorage } from "@/lib/globalSettingsClient";

/** Loads persisted global settings on app boot and applies client-side theme tokens. */
export default function GlobalSettingsBootstrap() {
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.settings) return;

        syncGlobalSettingsToLocalStorage(data.settings);
        applyAccentTheme((data.settings.accentColor || "default") as AccentColor);
      } catch {
        const cached = localStorage.getItem("omnisync_global_accent") as AccentColor | null;
        if (cached) applyAccentTheme(cached);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
