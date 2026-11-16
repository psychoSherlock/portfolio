// Window manager store. Single source of truth for every open window.
import { create } from "zustand";
import { getApp } from "./apps";

export const MENUBAR_H = 28;
export const MOBILE_BREAKPOINT = 720;

let seq = 1;
let zTop = 10;

export const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;

const viewport = () => ({
  w: window.innerWidth,
  h: window.innerHeight - MENUBAR_H,
});

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function placement(app, opts, count) {
  const vp = viewport();
  const def = opts.size || app.defaultSize || { w: 760, h: 500 };
  const w = Math.min(def.w, vp.w - 24);
  const h = Math.min(def.h, vp.h - 100);
  const off = (count % 7) * 28;
  const x = opts.position?.x ?? clamp((vp.w - w) / 2 - 60 + off, 8, Math.max(8, vp.w - w - 8));
  const y = opts.position?.y ?? clamp((vp.h - h) / 2 - 50 + off, 8, Math.max(8, vp.h - h - 8));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

const topVisible = (windows, exceptId) =>
  windows
    .filter((w) => w.id !== exceptId && !w.minimized && !w.closing)
    .sort((a, b) => b.z - a.z)[0]?.id ?? null;

export const useWindows = create((set, get) => ({
  windows: [],
  activeId: null,

  /**
   * Open an app. Returns the window id.
   * - singleton apps: focuses the existing window and merges new props into it.
   * - multi-instance apps: if props.path matches an open window, that one is focused.
   */
  open(appId, props = {}, opts = {}) {
    const app = getApp(appId);
    if (!app) {
      console.warn(`[wm] unknown app "${appId}"`);
      return null;
    }
    const { windows } = get();
    const existing = app.singleton
      ? windows.find((w) => w.appId === appId && !w.closing)
      : props.path
      ? windows.find((w) => w.appId === appId && !w.closing && w.props.path === props.path)
      : null;
    if (existing) {
      const hasProps = Object.keys(props).length > 0;
      set((s) => ({
        windows: s.windows.map((w) =>
          w.id === existing.id
            ? {
                ...w,
                minimized: false,
                z: ++zTop,
                props: hasProps ? { ...w.props, ...props } : w.props,
                propsVersion: w.propsVersion + (hasProps ? 1 : 0),
              }
            : w
        ),
        activeId: existing.id,
      }));
      return existing.id;
    }
    const id = `w${seq++}`;
    const rect = placement(app, opts, windows.length);
    const win = {
      id,
      appId,
      title: opts.title || app.name,
      props,
      propsVersion: 0,
      ...rect,
      z: ++zTop,
      minimized: false,
      maximized: !!opts.maximized,
      snap: null, // null | "left" | "right"
      closing: false,
    };
    set((s) => ({ windows: [...s.windows, win], activeId: id }));
    return id;
  },

  /** Start the close animation; the Window calls remove() when it finishes. */
  close(id) {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, closing: true } : w)),
      activeId: s.activeId === id ? topVisible(s.windows, id) : s.activeId,
    }));
  },

  remove(id) {
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) }));
  },

  closeAll(appId) {
    get()
      .windows.filter((w) => !appId || w.appId === appId)
      .forEach((w) => get().close(w.id));
  },

  focus(id) {
    const s = get();
    const win = s.windows.find((w) => w.id === id);
    if (!win) return;
    if (s.activeId === id && win.z === zTop && !win.minimized) return;
    set((st) => ({
      windows: st.windows.map((w) =>
        w.id === id ? { ...w, z: ++zTop, minimized: false } : w
      ),
      activeId: id,
    }));
  },

  blurAll() {
    if (get().activeId !== null) set({ activeId: null });
  },

  minimize(id) {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
      activeId: s.activeId === id ? topVisible(s.windows, id) : s.activeId,
    }));
  },

  toggleMaximize(id) {
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, maximized: !w.maximized, snap: null } : w
      ),
    }));
  },

  setSnap(id, snap) {
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, snap, maximized: false } : w
      ),
    }));
  },

  setRect(id, rect) {
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, ...rect } : w)),
    }));
  },

  setTitle(id, title) {
    const win = get().windows.find((w) => w.id === id);
    if (!win || win.title === title) return;
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)),
    }));
  },

  /** Dock click behaviour: launch, restore, focus, or minimize-if-active. */
  toggleApp(appId, props) {
    const s = get();
    const wins = s.windows.filter((w) => w.appId === appId && !w.closing);
    if (wins.length === 0) return s.open(appId, props);
    const top = [...wins].sort((a, b) => b.z - a.z)[0];
    if (top.minimized || s.activeId !== top.id) return s.focus(top.id), top.id;
    s.minimize(top.id);
    return top.id;
  },

  /** Cycle focus to the next window (used by the keyboard switcher). */
  cycle(dir = 1) {
    const s = get();
    const list = s.windows.filter((w) => !w.closing).sort((a, b) => a.z - b.z);
    if (list.length < 2) return;
    const i = list.findIndex((w) => w.id === s.activeId);
    const next = list[(i + dir + list.length) % list.length];
    s.focus(next.id);
  },
}));

/** Imperative window manager API, usable outside React. */
export const wm = new Proxy(
  {},
  { get: (_, key) => useWindows.getState()[key] }
);

/** Subscribe to a single window's record. */
export const useWindow = (id) =>
  useWindows((s) => s.windows.find((w) => w.id === id));

export const useActiveWindow = () =>
  useWindows((s) => s.windows.find((w) => w.id === s.activeId) || null);

/** True when the focused window is maximized (the dock auto-hides then). */
export const useActiveMaximized = () =>
  useWindows((s) => {
    const w = s.windows.find((x) => x.id === s.activeId);
    return !!w && w.maximized && !w.minimized;
  });
