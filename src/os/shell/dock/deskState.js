// Transient desktop-icon state (selection + inline rename), shared by DesktopIcons and desktopMenu.
import { create } from "zustand";
import fs, { DESKTOP } from "../../fs";
import { settings } from "../../settingsStore";

export const useDeskUI = create((set) => ({
  selected: [], // paths
  renaming: null, // path being renamed inline
  select: (selected) => set({ selected }),
  startRename: (path) => set({ renaming: path, selected: path ? [path] : [] }),
  stopRename: () => set({ renaming: null }),
}));
export const deskUI = new Proxy({}, { get: (_, key) => useDeskUI.getState()[key] });

const revealAndRename = (path) => {
  if (!settings.showDesktopIcons) settings.set({ showDesktopIcons: true });
  deskUI.startRename(path);
};

export function newDesktopFolder() {
  revealAndRename(fs.mkdir(`${DESKTOP}/untitled folder`, { unique: true }));
}

export function newDesktopTextFile() {
  revealAndRename(fs.createFile(DESKTOP, "untitled.txt", ""));
}
