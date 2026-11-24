// Dock-side shell overlays (Spotlight, Launchpad, Mission Control, app switcher) and the
// global window shortcuts. One keydown listener; only one overlay is open at a time (ui.overlay).
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useUI, ui } from "../ui";
import { useWindows, wm } from "../windowStore";
import Spotlight from "./dock/Spotlight";
import Launchpad from "./dock/Launchpad";
import MissionControl from "./dock/MissionControl";
import Switcher from "./dock/Switcher";
import "./dock/overlays.css";

const MINE = new Set(["spotlight", "launchpad", "missionControl", "switcher"]);

const isTyping = (t) =>
  t instanceof Element &&
  !!t.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], .xterm'
  );

/** Running apps, most recently focused first. */
function runningApps() {
  const best = new Map();
  for (const w of useWindows.getState().windows) {
    if (w.closing) continue;
    // Prefer visible windows, then the highest z.
    const score = (w.minimized ? 0 : 1e9) + w.z;
    if (!best.has(w.appId) || best.get(w.appId) < score) best.set(w.appId, score);
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function focusApp(appId) {
  const wins = useWindows
    .getState()
    .windows.filter((w) => w.appId === appId && !w.closing)
    .sort((a, b) => (a.minimized === b.minimized ? b.z - a.z : a.minimized ? 1 : -1));
  if (wins[0]) wm.focus(wins[0].id);
}

export default function DockOverlays() {
  const overlay = useUI((s) => s.overlay);
  const [sw, setSw] = useState(null); // { apps, index }
  const swRef = useRef(null);
  const modRef = useRef(null); // "Alt" | "Control" held for the switcher

  // Close any open context menu when an overlay appears; drop switcher state when it goes away.
  useEffect(() => {
    if (overlay) ui.hideContextMenu();
    if (overlay !== "switcher" && swRef.current) {
      swRef.current = null;
      modRef.current = null;
      setSw(null);
    }
  }, [overlay]);

  useEffect(() => {
    const commit = () => {
      const cur = swRef.current;
      modRef.current = null;
      if (cur) {
        const id = cur.apps[cur.index];
        ui.setOverlay(null);
        if (id) focusApp(id);
      }
    };

    const advance = (dir, mod) => {
      const cur = swRef.current;
      if (!cur || useUI.getState().overlay !== "switcher") {
        const apps = runningApps();
        if (!apps.length) return;
        modRef.current = mod;
        const index = apps.length > 1 ? (dir > 0 ? 1 : apps.length - 1) : 0;
        swRef.current = { apps, index };
        setSw(swRef.current);
        ui.setOverlay("switcher");
        return;
      }
      const n = cur.apps.length;
      const next = { ...cur, index: (cur.index + dir + n) % n };
      swRef.current = next;
      setSw(next);
    };

    const onKeyDown = (e) => {
      const st = useUI.getState();
      if (st.locked) return;
      const overlay = st.overlay;
      const typing = isTyping(e.target);
      const mod = e.ctrlKey || e.metaKey;

      // ---- app switcher ----
      if ((e.altKey || e.ctrlKey) && !e.metaKey && e.code === "Backquote") {
        e.preventDefault();
        advance(e.shiftKey ? -1 : 1, e.altKey ? "Alt" : "Control");
        return;
      }
      if (overlay === "switcher") {
        if (e.key === "Escape") {
          e.preventDefault();
          modRef.current = null;
          ui.setOverlay(null);
        } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          advance(e.key === "ArrowRight" ? 1 : -1, modRef.current);
        } else if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        return;
      }

      // ---- Spotlight ----
      if (
        (mod && !e.altKey && !e.shiftKey && e.code === "KeyK") ||
        (e.ctrlKey && !e.altKey && !e.metaKey && e.code === "Space") ||
        (e.altKey && !mod && e.code === "Space")
      ) {
        e.preventDefault();
        ui.toggleOverlay("spotlight");
        return;
      }
      if (e.key === "/" && !mod && !e.altKey && !typing && !overlay) {
        e.preventDefault();
        ui.setOverlay("spotlight");
        return;
      }

      // ---- Mission Control / Launchpad ----
      if ((e.key === "F3" && !mod && !e.altKey) || (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "ArrowUp")) {
        e.preventDefault();
        ui.toggleOverlay("missionControl");
        return;
      }
      if (e.key === "F4" && !mod && !e.altKey) {
        e.preventDefault();
        ui.toggleOverlay("launchpad");
        return;
      }

      if (e.key === "Escape" && MINE.has(overlay)) {
        e.preventDefault();
        ui.setOverlay(null);
        return;
      }

      // ---- window shortcuts ----
      if (e.altKey && !mod && !e.shiftKey && !overlay) {
        const id = useWindows.getState().activeId;
        const win = id && useWindows.getState().windows.find((w) => w.id === id);
        if (!win || win.closing || win.minimized) return;
        if (e.code === "KeyW") {
          e.preventDefault();
          wm.close(id);
        } else if (e.code === "KeyM") {
          e.preventDefault();
          wm.minimize(id);
        } else if (e.key === "Enter") {
          e.preventDefault();
          wm.toggleMaximize(id);
        }
      }
    };

    const onKeyUp = (e) => {
      if (!modRef.current || useUI.getState().overlay !== "switcher") return;
      if (e.key === modRef.current) {
        // Stop a lone Alt release from activating the browser's menu bar.
        e.preventDefault();
        commit();
      }
    };

    const onBlur = () => {
      if (useUI.getState().overlay === "switcher") {
        modRef.current = null;
        ui.setOverlay(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const pickSwitcher = (index) => {
    const cur = swRef.current;
    if (!cur) return;
    modRef.current = null;
    ui.setOverlay(null);
    const id = cur.apps[index];
    if (id) focusApp(id);
  };

  return (
    <AnimatePresence>
      {overlay === "spotlight" && <Spotlight key="spotlight" />}
      {overlay === "launchpad" && <Launchpad key="launchpad" />}
      {overlay === "missionControl" && <MissionControl key="missionControl" />}
      {overlay === "switcher" && sw && (
        <Switcher key="switcher" apps={sw.apps} index={sw.index} onPick={pickSwitcher} />
      )}
    </AnimatePresence>
  );
}
