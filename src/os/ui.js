// Small cross-cutting UI stores: context menu, notifications, shell overlays.
import { create } from "zustand";

let nid = 1;

export const useUI = create((set, get) => ({
  // ---- context menu -------------------------------------------------------
  // items: [{ label, icon?, shortcut?, danger?, disabled?, checked?, onClick?, submenu? } | { separator: true }]
  contextMenu: null, // { x, y, items }
  showContextMenu(x, y, items) {
    set({ contextMenu: { x, y, items: items.filter(Boolean) } });
  },
  hideContextMenu() {
    if (get().contextMenu) set({ contextMenu: null });
  },

  // ---- notifications ------------------------------------------------------
  // { id, title, body, icon?, appId?, time, onClick? }
  notifications: [], // full history (notification center)
  toasts: [], // currently visible banners
  notify(n) {
    const item = { id: nid++, time: Date.now(), ...n };
    set((s) => ({
      notifications: [item, ...s.notifications].slice(0, 50),
      toasts: [...s.toasts, item],
    }));
    setTimeout(() => get().dismissToast(item.id), n.duration ?? 4500);
    return item.id;
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  clearNotifications() {
    set({ notifications: [] });
  },

  // ---- shell overlays (only one open at a time) ---------------------------
  // null | "spotlight" | "launchpad" | "controlCenter" | "notificationCenter" | "missionControl" | "switcher"
  overlay: null,
  setOverlay(overlay) {
    set({ overlay });
  },
  toggleOverlay(name) {
    set((s) => ({ overlay: s.overlay === name ? null : name }));
  },

  // ---- session ------------------------------------------------------------
  locked: false,
  setLocked(locked) {
    set({ locked });
  },
}));

export const ui = new Proxy({}, { get: (_, key) => useUI.getState()[key] });

/** Convenience: open a context menu from a React onContextMenu event. */
export function contextMenu(event, items) {
  event.preventDefault();
  event.stopPropagation();
  ui.showContextMenu(event.clientX, event.clientY, items);
}

export const notify = (n) => ui.notify(n);
