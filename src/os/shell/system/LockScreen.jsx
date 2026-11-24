// Lock screen: blurred wallpaper, big clock, avatar. Any click or key slides it away.
import { useEffect, useRef } from "react";
import { motion as Motion } from "framer-motion";
import fs from "../../fs";
import { useSettings } from "../../settingsStore";
import { ui } from "../../ui";
import avatar from "../../../assets/images/personal/me-hacker.jpg";
import { formatLongDate, formatTime, useNow } from "./hooks";
import { onKeys } from "./sysStore";

// Ignore input for a moment after locking, so the click / key that locked doesn't unlock.
const GRACE_MS = 450;

export default function LockScreen({ reduceMotion }) {
  const now = useNow(60000);
  const h24 = useSettings((s) => s.clock24h);
  const wallpaper = useSettings((s) => s.wallpaper);
  const url = wallpaper?.startsWith("/home/") ? fs.url(wallpaper) : wallpaper;
  const since = useRef(0);

  useEffect(() => {
    since.current = performance.now();
    document.activeElement?.blur?.();
    const unlock = () => {
      if (performance.now() - since.current > GRACE_MS) ui.setLocked(false);
    };
    // Highest priority: while locked, every key belongs to the lock screen.
    const off = onKeys((e) => {
      if (!e.repeat && !["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) unlock();
      return true;
    }, 1000);
    return off;
  }, []);

  const tryUnlock = () => {
    if (performance.now() - since.current > GRACE_MS) ui.setLocked(false);
  };

  return (
    <Motion.div
      className="sys-lock"
      role="dialog"
      aria-modal="true"
      aria-label="Lock screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { y: "-100%", transition: { duration: 0.55, ease: [0.65, 0, 0.35, 1] } }}
      transition={{ duration: reduceMotion ? 0.15 : 0.35 }}
      onPointerDown={(e) => e.button === 0 && tryUnlock()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onWheel={(e) => e.deltaY > 20 && tryUnlock()}
    >
      <div className="sys-lock-bg" style={url ? { backgroundImage: `url("${url}")` } : undefined} />
      <div className="sys-lock-scrim" />
      <div className="sys-lock-top">
        <div className="sys-lock-date">{formatLongDate(now)}</div>
        <div className="sys-lock-time">{formatTime(now, h24, { ampm: false })}</div>
      </div>
      <div className="sys-lock-user">
        <img className="sys-lock-avatar" src={avatar} alt="" decoding="async" draggable={false} />
        <div className="sys-lock-name">psychoSherlock</div>
        <div className="sys-lock-hint">Click or press any key to unlock</div>
      </div>
    </Motion.div>
  );
}
