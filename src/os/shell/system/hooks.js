// Small hooks + date helpers for the system shell.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { onKeys } from "./sysStore";

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n) => String(n).padStart(2, "0");

/** "9:41 PM" or "21:41" */
export function formatTime(d, h24, { ampm = true } = {}) {
  const h = d.getHours();
  const m = pad(d.getMinutes());
  if (h24) return `${pad(h)}:${m}`;
  const t = `${h % 12 || 12}:${m}`;
  return ampm ? `${t} ${h >= 12 ? "PM" : "AM"}` : t;
}
/** "Mon 16 Nov" */
export const formatShortDate = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
/** "Monday, 16 November" */
export const formatLongDate = (d) =>
  `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;

export function formatAgo(time, now = Date.now()) {
  const s = Math.max(0, Math.round((now - time) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function formatUptime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(s % 60)}s`;
  return `${s}s`;
}

/** Current Date, re-rendering on every `step` boundary (default: each minute). */
export function useNow(step = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t;
    const arm = () => {
      t = setTimeout(() => {
        setNow(new Date());
        arm();
      }, step - (Date.now() % step) + 4);
    };
    arm();
    const onVisible = () => !document.hidden && setNow(new Date());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [step]);
  return now;
}

const NARROW = "(max-width: 719px)";
const subNarrow = (cb) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** True below the 720px mobile breakpoint. */
export const useNarrow = () =>
  useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW).matches);

const subOnline = (cb) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
export const useOnline = () => useSyncExternalStore(subOnline, () => navigator.onLine);

/** { level: 0..1, charging } or null when the Battery API is unavailable. */
export function useBattery() {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (typeof navigator.getBattery !== "function") return;
    let bat = null;
    let alive = true;
    const update = () => alive && bat && setState({ level: bat.level, charging: bat.charging });
    navigator
      .getBattery()
      .then((b) => {
        if (!alive) return;
        bat = b;
        update();
        b.addEventListener("levelchange", update);
        b.addEventListener("chargingchange", update);
      })
      .catch(() => {
        /* blocked by permissions policy: keep the indicator hidden */
      });
    return () => {
      alive = false;
      bat?.removeEventListener("levelchange", update);
      bat?.removeEventListener("chargingchange", update);
    };
  }, []);
  return state;
}

/**
 * Dismiss a floating panel on Escape or a pointer press outside of it.
 * Presses on its menu-bar toggle (`[data-overlay-toggle]`) and inside menus are ignored.
 */
export function useDismiss(ref, close, priority = 50) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const off = onKeys((e) => {
      if (e.key !== "Escape") return false;
      closeRef.current();
      return true;
    }, priority);
    const down = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (ref.current?.contains(t)) return;
      if (t.closest("[data-overlay-toggle], .sys-menu-root")) return;
      closeRef.current();
    };
    window.addEventListener("pointerdown", down, true);
    return () => {
      off();
      window.removeEventListener("pointerdown", down, true);
    };
  }, [ref, priority]);
}
