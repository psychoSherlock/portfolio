// File clipboard shared by every Finder window.
import { useSyncExternalStore } from "react";

let state = { paths: [], mode: "copy" }; // mode: "copy" | "cut"
const listeners = new Set();

const emit = () => listeners.forEach((l) => l());

export const clipboard = {
  get: () => state,
  set(paths, mode = "copy") {
    state = { paths: [...paths], mode };
    emit();
  },
  clear() {
    if (!state.paths.length) return;
    state = { paths: [], mode: "copy" };
    emit();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useClipboard = () => useSyncExternalStore(clipboard.subscribe, clipboard.get);
