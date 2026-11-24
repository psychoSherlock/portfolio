// Menu-bar dropdown definitions. Each builder runs when its menu opens, so items reflect
// the live window / selection state at that moment.
import { getApp } from "../../apps";
import { useWindows, wm } from "../../windowStore";
import { settings } from "../../settingsStore";
import { ui } from "../../ui";
import { openExternal } from "../../open";
import { HOME } from "../../fs";
import { lockScreen, restart, shutDown, useSys } from "./sysStore";

const SEP = { separator: true };

/** The focused, visible window (or null). */
export function activeWin() {
  const s = useWindows.getState();
  const w = s.windows.find((x) => x.id === s.activeId);
  return w && !w.closing && !w.minimized ? w : null;
}

/** The app the menu bar speaks for: the focused window's app, Finder otherwise. */
export function activeAppId() {
  return activeWin()?.appId || "finder";
}

// ---- window actions (shared with keyboard shortcuts) -----------------------------
export const actions = {
  newWindow() {
    const app = getApp(activeAppId()) || getApp("finder");
    // Singletons just come forward; Finder and other multi-window apps get a fresh window.
    wm.open(app.id);
  },
  closeWindow() {
    const w = activeWin();
    if (w) wm.close(w.id);
  },
  minimize() {
    const w = activeWin();
    if (w) wm.minimize(w.id);
  },
  zoom() {
    const w = activeWin();
    if (w) wm.toggleMaximize(w.id);
  },
  tile(side) {
    const w = activeWin();
    if (w) wm.setSnap(w.id, w.snap === side ? null : side);
  },
  bringAllToFront() {
    const s = useWindows.getState();
    const active = activeWin();
    const appId = active?.appId;
    const list = s.windows
      .filter((w) => !w.closing && !w.minimized && (!appId || w.appId === appId))
      .sort((a, b) => a.z - b.z);
    list.forEach((w) => wm.focus(w.id));
    if (active) wm.focus(active.id);
  },
  hideApp(appId) {
    useWindows
      .getState()
      .windows.filter((w) => w.appId === appId && !w.closing && !w.minimized)
      .forEach((w) => wm.minimize(w.id));
  },
  hideOthers(appId) {
    useWindows
      .getState()
      .windows.filter((w) => w.appId !== appId && !w.closing && !w.minimized)
      .forEach((w) => wm.minimize(w.id));
  },
  showAll() {
    const s = useWindows.getState();
    const active = s.activeId;
    s.windows
      .filter((w) => w.minimized && !w.closing)
      .sort((a, b) => a.z - b.z)
      .forEach((w) => wm.focus(w.id));
    if (active) wm.focus(active);
  },
  shortcuts() {
    useSys.setState({ shortcuts: true });
  },
};

// ---- Edit menu helpers (menus never take focus, so the selection is still live) ----
function editable() {
  const el = document.activeElement;
  if (!el) return null;
  if (el.isContentEditable) return el;
  if (el.tagName === "TEXTAREA") return el.readOnly ? null : el;
  if (el.tagName === "INPUT" && /^(text|search|url|email|tel|password|number|)$/i.test(el.type))
    return el.readOnly ? null : el;
  return null;
}
function hasSelection() {
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
    try {
      return el.selectionStart !== el.selectionEnd;
    } catch {
      return false;
    }
  }
  return !!window.getSelection()?.toString();
}
const exec = (cmd, arg) => {
  try {
    return document.execCommand(cmd, false, arg);
  } catch {
    return false;
  }
};
async function paste() {
  const el = editable();
  if (!el || !navigator.clipboard?.readText) return;
  try {
    const text = await navigator.clipboard.readText();
    el.focus();
    if (!exec("insertText", text) && "setRangeText" in el) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  } catch {
    ui.notify({ title: "Paste unavailable", body: "The browser blocked clipboard access. Use Ctrl+V instead." });
  }
}
function selectAll() {
  const el = editable() || (document.activeElement?.tagName === "INPUT" ? document.activeElement : null);
  if (el && typeof el.select === "function") return el.select();
  if (el) return exec("selectAll");
  // Otherwise select the text of the focused window's content.
  const w = activeWin();
  const root = w && document.querySelector(`[data-window-id="${w.id}"] .os-window-content`);
  if (!root) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function toggleFullScreen() {
  const d = document;
  if (d.fullscreenElement) d.exitFullscreen?.().catch(() => {});
  else d.documentElement.requestFullscreen?.().catch(() => {});
}

// ---- builders -------------------------------------------------------------------
export function logoMenu() {
  return [
    { label: "About This Mac", onClick: () => wm.open("settings", { pane: "about" }) },
    SEP,
    { label: "System Settings…", onClick: () => wm.open("settings") },
    SEP,
    { label: "Close All Windows", onClick: () => wm.closeAll(), disabled: !useWindows.getState().windows.some((w) => !w.closing) },
    SEP,
    { label: "Restart…", onClick: restart },
    { label: "Shut Down…", onClick: shutDown },
    SEP,
    { label: "Lock Screen", shortcut: "⌥L", onClick: lockScreen },
    { label: "Log Out psychoSherlock…", onClick: lockScreen },
  ];
}

export function appMenu(appId) {
  const app = getApp(appId);
  const name = app?.name || "Finder";
  const running = useWindows.getState().windows.some((w) => w.appId === appId && !w.closing);
  return [
    { label: `About ${name}`, onClick: () => (appId === "about" ? wm.open("about") : wm.open("settings", { pane: "about" })) },
    SEP,
    { label: "Settings…", onClick: () => wm.open("settings") },
    SEP,
    { label: `Hide ${name}`, disabled: !running, onClick: () => actions.hideApp(appId) },
    { label: "Hide Others", onClick: () => actions.hideOthers(appId) },
    { label: "Show All", onClick: actions.showAll },
    SEP,
    { label: `Quit ${name}`, disabled: !running, onClick: () => wm.closeAll(appId) },
  ];
}

export function fileMenu(appId) {
  const app = getApp(appId);
  const w = activeWin();
  return [
    { label: app?.singleton ? `Show ${app.name}` : "New Window", shortcut: "⌥N", onClick: actions.newWindow },
    appId !== "finder" && { label: "New Finder Window", onClick: () => wm.open("finder") },
    { label: "Open Home Folder", onClick: () => wm.open("finder", { path: HOME }) },
    SEP,
    { label: "Close Window", shortcut: "⌥W", disabled: !w, onClick: actions.closeWindow },
    { label: "Close All", disabled: !w, onClick: () => wm.closeAll(appId) },
  ];
}

export function editMenu() {
  const el = editable();
  const sel = hasSelection();
  const canPaste = !!el && !!navigator.clipboard?.readText;
  return [
    { label: "Undo", shortcut: "Ctrl Z", disabled: !el, onClick: () => exec("undo") },
    { label: "Redo", shortcut: "Ctrl ⇧Z", disabled: !el, onClick: () => exec("redo") },
    SEP,
    { label: "Cut", shortcut: "Ctrl X", disabled: !el || !sel, onClick: () => exec("cut") },
    { label: "Copy", shortcut: "Ctrl C", disabled: !sel, onClick: () => exec("copy") },
    { label: "Paste", shortcut: "Ctrl V", disabled: !canPaste, onClick: paste },
    { label: "Select All", shortcut: "Ctrl A", onClick: selectAll },
  ];
}

export function viewMenu() {
  const full = !!document.fullscreenElement;
  return [
    { label: full ? "Exit Full Screen" : "Enter Full Screen", disabled: !document.fullscreenEnabled, onClick: toggleFullScreen },
    SEP,
    { label: "Show Desktop Icons", checked: !!settings.showDesktopIcons, onClick: () => settings.set({ showDesktopIcons: !settings.showDesktopIcons }) },
    { label: "Dark Appearance", checked: settings.theme === "dark", onClick: () => settings.set({ theme: settings.theme === "dark" ? "light" : "dark" }) },
    { label: "24-Hour Clock", checked: !!settings.clock24h, onClick: () => settings.set({ clock24h: !settings.clock24h }) },
    SEP,
    { label: "Mission Control", onClick: () => ui.toggleOverlay("missionControl") },
    { label: "Launchpad", onClick: () => ui.toggleOverlay("launchpad") },
    { label: "Spotlight", onClick: () => ui.toggleOverlay("spotlight") },
  ];
}

export function windowMenu() {
  const w = activeWin();
  const s = useWindows.getState();
  const open = s.windows.filter((x) => !x.closing).sort((a, b) => a.z - b.z);
  const none = !w;
  return [
    { label: "Minimize", shortcut: "⌥M", disabled: none, onClick: actions.minimize },
    { label: w?.maximized ? "Restore" : "Zoom", shortcut: "⌥↩", disabled: none, onClick: actions.zoom },
    SEP,
    { label: "Tile Window to Left of Screen", disabled: none, checked: w?.snap === "left", onClick: () => actions.tile("left") },
    { label: "Tile Window to Right of Screen", disabled: none, checked: w?.snap === "right", onClick: () => actions.tile("right") },
    SEP,
    { label: "Bring All to Front", disabled: open.length === 0, onClick: actions.bringAllToFront },
    open.length > 0 && SEP,
    ...open.map((x) => ({
      label: x.minimized ? `${x.title} (minimized)` : x.title,
      icon: getApp(x.appId)?.icon,
      checked: x.id === s.activeId && !x.minimized,
      onClick: () => wm.focus(x.id),
    })),
  ];
}

export function helpMenu() {
  return [
    { label: "Keyboard Shortcuts", shortcut: "⌥/", onClick: actions.shortcuts },
    SEP,
    { label: "About Athul (psychoSherlock)", onClick: () => wm.open("about") },
    { label: "Contact", onClick: () => wm.open("mail") },
    SEP,
    { label: "psychoSherlock on GitHub", onClick: () => openExternal("https://github.com/psychoSherlock") },
    { label: "psychosherlock.github.io", onClick: () => openExternal("https://psychosherlock.github.io") },
  ];
}

export const APP_MENUS = [
  { key: "file", label: "File", build: fileMenu },
  { key: "edit", label: "Edit", build: editMenu },
  { key: "view", label: "View", build: viewMenu },
  { key: "window", label: "Window", build: windowMenu },
  { key: "help", label: "Help", build: helpMenu },
];
