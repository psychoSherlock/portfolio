// Renders the global context menu (ui.showContextMenu / contextMenu(e, items)).
import { useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { ui, useUI } from "../../ui";
import Menu from "./Menu";

// Give every opened menu its own identity, so right-clicking somewhere else while one is
// open mounts a fresh menu (the old one fades out) instead of morphing the old one.
const ids = new WeakMap();
let seq = 0;
useUI.subscribe((s) => {
  if (s.contextMenu && !ids.has(s.contextMenu)) ids.set(s.contextMenu, ++seq);
});

export default function ContextMenu() {
  const cm = useUI((s) => s.contextMenu);
  // Exiting menus detach their listeners, so only the live menu can call this.
  const close = useCallback(() => ui.hideContextMenu(), []);
  return (
    <AnimatePresence>
      {cm && cm.items?.length > 0 && (
        <Menu key={ids.get(cm) ?? "cm"} items={cm.items} x={cm.x} y={cm.y} origin="context" onClose={close} />
      )}
    </AnimatePresence>
  );
}
