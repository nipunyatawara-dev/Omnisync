import type { AccentColor } from "@/lib/globalSettingsTypes";

const ACCENT_PRESETS: Record<
  AccentColor,
  { fg: string; bg: string; border: string; primaryBg: string; primaryBorder: string; primaryHover: string }
> = {
  default: {
    fg: "#58a6ff",
    bg: "rgba(56, 139, 253, 0.1)",
    border: "rgba(56, 139, 253, 0.4)",
    primaryBg: "#238636",
    primaryBorder: "#2ea44f",
    primaryHover: "#2ea44f",
  },
  emerald: {
    fg: "#3fb950",
    bg: "rgba(63, 185, 80, 0.12)",
    border: "rgba(63, 185, 80, 0.45)",
    primaryBg: "#238636",
    primaryBorder: "#2ea44f",
    primaryHover: "#3fb950",
  },
  royal: {
    fg: "#a371f7",
    bg: "rgba(163, 113, 247, 0.12)",
    border: "rgba(163, 113, 247, 0.45)",
    primaryBg: "#8957e5",
    primaryBorder: "#a371f7",
    primaryHover: "#bc8cff",
  },
  sunset: {
    fg: "#f0883e",
    bg: "rgba(240, 136, 62, 0.12)",
    border: "rgba(240, 136, 62, 0.45)",
    primaryBg: "#bd561d",
    primaryBorder: "#f0883e",
    primaryHover: "#ffa657",
  },
};

export function applyAccentTheme(accent: AccentColor) {
  if (typeof document === "undefined") return;
  const preset = ACCENT_PRESETS[accent] ?? ACCENT_PRESETS.default;
  const root = document.documentElement;
  root.style.setProperty("--color-accent-fg", preset.fg);
  root.style.setProperty("--color-accent-bg", preset.bg);
  root.style.setProperty("--color-accent-border", preset.border);
  root.style.setProperty("--color-btn-primary-bg", preset.primaryBg);
  root.style.setProperty("--color-btn-primary-border", preset.primaryBorder);
  root.style.setProperty("--color-btn-primary-hover-bg", preset.primaryHover);
  root.dataset.omnisyncAccent = accent;
}
