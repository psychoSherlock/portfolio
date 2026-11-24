// System-shell state shared by the menu bar, overlays and desktop icons.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ui } from "../../ui";

/** Moment the desktop code was loaded - "uptime" is measured from here. */
export const BOOT_TIME = Date.now();

export const useSys = create((set) => ({
  poweredOff: false,
  shortcuts: false, // keyboard shortcuts sheet
  wifi: true, // cosmetic radios
  bluetooth: true,
  airdrop: false,
  set: (patch) => set(patch),
}));
export const sys = new Proxy({}, { get: (_, key) => useSys.getState()[key] });

/** Desktop icon grid positions ({ [path]: { c: columnFromRight, r: row } }) + sort order. */
export const useDesk = create(
  persist(
    (set) => ({
      positions: {},
      sort: "name", // "name" | "kind" | "date"
      setPositions: (positions) => set({ positions }),
      cleanUp: () => set({ positions: {} }),
      setSort: (sort) => set({ sort, positions: {} }),
    }),
    { name: "sherlockos.desktop.positions", version: 1 }
  )
);
export const desk = new Proxy({}, { get: (_, key) => useDesk.getState()[key] });

// ---- session actions --------------------------------------------------------
export function lockScreen() {
  document.activeElement?.blur?.();
  ui.hideContextMenu();
  ui.setOverlay(null);
  ui.setLocked(true);
}
export function shutDown() {
  document.activeElement?.blur?.();
  ui.hideContextMenu();
  ui.setOverlay(null);
  useSys.setState({ poweredOff: true, shortcuts: false });
}
export function restart() {
  ui.hideContextMenu();
  ui.setOverlay(null);
  useSys.setState({ poweredOff: false, shortcuts: false });
  window.location.hash = "#/";
}

// ---- keyboard routing ---------------------------------------------------------
// SystemOverlays owns the single window keydown listener and offers each event to the
// registered handlers, highest priority first. A handler returns true to consume it.
const handlers = new Set();
export function onKeys(fn, priority = 0) {
  const h = { fn, priority };
  handlers.add(h);
  return () => handlers.delete(h);
}
export function dispatchKey(e) {
  if (handlers.size === 0) return false;
  const list = [...handlers].sort((a, b) => b.priority - a.priority);
  for (const h of list) if (h.fn(e)) return true;
  return false;
}
