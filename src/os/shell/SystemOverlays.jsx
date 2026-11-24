// System overlays: context menu, banners, Control Center, Notification Center, shortcuts
// sheet, lock screen and the powered-off state. Also owns the shell's single keydown listener.
import { useEffect } from "react";
import { AnimatePresence, useReducedMotion } from "framer-motion";
import { useSettings } from "../settingsStore";
import { ui, useUI } from "../ui";
import ContextMenu from "./system/ContextMenu";
import ControlCenter from "./system/ControlCenter";
import NotificationCenter from "./system/NotificationCenter";
import { Toasts } from "./system/Notifications";
import LockScreen from "./system/LockScreen";
import PowerOff from "./system/PowerOff";
import ShortcutsSheet from "./system/ShortcutsSheet";
import { dispatchKey, lockScreen, onKeys, useSys } from "./system/sysStore";
import { actions } from "./system/menus";
import "./system/system.css";

function useKeyRouter() {
  useEffect(() => {
    // Capture phase: open menus / the lock screen see keys before apps do.
    const onKeyDown = (e) => {
      if (e.isComposing) return;
      if (dispatchKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    // Global shortcuts (lowest priority). Option-combos only, so typing is never affected.
    const off = onKeys((e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat) return false;
      const st = useUI.getState();
      if (st.locked || useSys.getState().poweredOff) return false;
      if (e.code === "KeyL" && !e.shiftKey) {
        lockScreen();
        return true;
      }
      if (e.code === "Slash") {
        ui.hideContextMenu();
        useSys.setState({ shortcuts: true });
        return true;
      }
      if (e.code === "KeyN" && !e.shiftKey && !st.overlay) {
        actions.newWindow();
        return true;
      }
      return false;
    }, 0);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      off();
    };
  }, []);
}

export default function SystemOverlays() {
  useKeyRouter();
  const overlay = useUI((s) => s.overlay);
  const locked = useUI((s) => s.locked);
  const poweredOff = useSys((s) => s.poweredOff);
  const shortcuts = useSys((s) => s.shortcuts);
  const prefersReduced = useReducedMotion();
  const reduceMotion = useSettings((s) => s.reduceMotion) || !!prefersReduced;

  // However the screen got locked (menu, shortcut, Spotlight…), clear transient UI under it.
  useEffect(() => {
    if (!locked) return;
    document.activeElement?.blur?.();
    ui.hideContextMenu();
    if (useUI.getState().overlay) ui.setOverlay(null);
    useSys.setState({ shortcuts: false });
  }, [locked]);

  return (
    <>
      <Toasts reduceMotion={reduceMotion} hidden={overlay === "notificationCenter" || locked || poweredOff} />

      <AnimatePresence>
        {overlay === "controlCenter" && <ControlCenter key="cc" reduceMotion={reduceMotion} />}
      </AnimatePresence>
      <AnimatePresence>
        {overlay === "notificationCenter" && <NotificationCenter key="nc" reduceMotion={reduceMotion} />}
      </AnimatePresence>
      <AnimatePresence>{shortcuts && <ShortcutsSheet key="keys" reduceMotion={reduceMotion} />}</AnimatePresence>

      <ContextMenu />

      <AnimatePresence>{locked && <LockScreen key="lock" reduceMotion={reduceMotion} />}</AnimatePresence>
      <AnimatePresence>{poweredOff && <PowerOff key="off" reduceMotion={reduceMotion} />}</AnimatePresence>
    </>
  );
}
