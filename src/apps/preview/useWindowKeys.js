// Keyboard shortcuts that only fire while this app's window is the active one.
import { useEffect, useRef } from "react";
import { useWindows } from "../../os/windowStore";
import { useUI } from "../../os/ui";

export default function useWindowKeys(windowId, handler) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (useWindows.getState().activeId !== windowId) return;
      const uiState = useUI.getState();
      if (uiState.overlay || uiState.contextMenu || uiState.locked) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(t.tagName)) return;
        // let focused buttons/links keep their own Space / Enter activation
        if ((e.key === " " || e.key === "Enter") && t.closest("button,a")) return;
      }
      ref.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [windowId]);
}
