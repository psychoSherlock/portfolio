// Persisted user settings (localStorage). Applied to <html> as CSS variables / data attributes.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const ACCENTS = [
  "#b05cff", // signature purple
  "#0a84ff",
  "#30d158",
  "#ff9f0a",
  "#ff375f",
  "#9fef00", // HTB green
  "#64d2ff",
];

export const DEFAULT_WALLPAPER = "/home/sherlock/Pictures/Wallpapers/kali.jpg";

export const useSettings = create(
  persist(
    (set) => ({
      theme: "dark", // "dark" | "light"
      accent: ACCENTS[0],
      wallpaper: DEFAULT_WALLPAPER, // virtual fs path OR absolute/https url
      wallpaperFit: "cover", // "cover" | "contain"
      dockSize: 52, // px, base icon size
      dockMagnify: true,
      dockAutoHide: false,
      reduceMotion: false,
      transparency: true,
      sound: true,
      volume: 0.6,
      brightness: 1,
      showDesktopIcons: true,
      clock24h: false,
      skipBoot: false,
      set: (patch) => set(patch),
      reset: () =>
        set({
          theme: "dark",
          accent: ACCENTS[0],
          wallpaper: DEFAULT_WALLPAPER,
          wallpaperFit: "cover",
          dockSize: 52,
          dockMagnify: true,
          dockAutoHide: false,
          reduceMotion: false,
          transparency: true,
          sound: true,
          volume: 0.6,
          brightness: 1,
          showDesktopIcons: true,
          clock24h: false,
          skipBoot: false,
        }),
    }),
    { name: "sherlockos.settings", version: 1 }
  )
);

export const settings = new Proxy(
  {},
  { get: (_, key) => useSettings.getState()[key] }
);

/** Push settings onto the document root. Called once from Desktop + on change. */
export function applySettings(s = useSettings.getState()) {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.reduceMotion = s.reduceMotion ? "true" : "false";
  root.dataset.transparency = s.transparency ? "true" : "false";
  root.style.setProperty("--accent", s.accent);
  root.style.setProperty("--dock-icon", `${s.dockSize}px`);
}
