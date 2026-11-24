// The Dock: pinned apps, running apps, Launchpad and Trash, with real magnification.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { SYSTEM_ICONS, dockApps, getApp } from "../apps";
import fs, { TRASH, useFs } from "../fs";
import { settings, useSettings } from "../settingsStore";
import { contextMenu, ui, useUI } from "../ui";
import { MOBILE_BREAKPOINT, useActiveMaximized, useWindows, wm } from "../windowStore";
import "./dock/dock.css";

const MAX_SCALE = 1.8; // icon growth right under the pointer
const RANGE = 3.1; // falloff radius, in multiples of the base icon size
const GAP = 4;
const SEP_W = 13;
const MIN_ICON = 36;
const SPRING = { mass: 0.1, stiffness: 190, damping: 15 };

function useViewportWidth() {
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vw;
}

const appWindows = (appId) =>
  wm.windows.filter((w) => w.appId === appId && !w.closing).sort((a, b) => b.z - a.z);

function appMenu(app) {
  const wins = appWindows(app.id);
  const running = wins.length > 0;
  const activeId = useWindows.getState().activeId;
  return [
    running
      ? { label: "Show All Windows", onClick: () => [...wins].reverse().forEach((w) => wm.focus(w.id)) }
      : { label: "Open", onClick: () => wm.open(app.id) },
    !app.singleton && { label: "New Window", onClick: () => wm.open(app.id) },
    running && { separator: true },
    ...wins.map((w) => ({
      label: w.title || app.name,
      checked: w.id === activeId,
      onClick: () => wm.focus(w.id),
    })),
    running && { separator: true },
    running && {
      label: "Hide",
      disabled: wins.every((w) => w.minimized),
      onClick: () => wins.forEach((w) => !w.minimized && wm.minimize(w.id)),
    },
    running && { label: "Quit", onClick: () => wm.closeAll(app.id) },
  ];
}

const trashMenu = () => [
  { label: "Open", onClick: () => wm.open("finder", { path: TRASH }) },
  { separator: true },
  {
    label: "Empty Trash",
    danger: true,
    disabled: fs.list(TRASH, { hidden: true }).length === 0,
    onClick: () => fs.emptyTrash(),
  },
];

const dockMenu = () => [
  {
    label: settings.dockAutoHide ? "Turn Hiding Off" : "Turn Hiding On",
    onClick: () => settings.set({ dockAutoHide: !settings.dockAutoHide }),
  },
  {
    label: settings.dockMagnify ? "Turn Magnification Off" : "Turn Magnification On",
    onClick: () => settings.set({ dockMagnify: !settings.dockMagnify }),
  },
  { separator: true },
  { label: "Dock Settings…", onClick: () => wm.open("settings", { pane: "dock" }) },
];

const DockItem = memo(function DockItem({
  id,
  label,
  icon,
  running,
  badge,
  entering,
  reduceMotion,
  mouseX,
  baseMV,
  magMV,
  onActivate,
  onMenu,
}) {
  const ref = useRef(null);
  const controls = useAnimationControls();

  // Pointer distance -> target size (raised-cosine falloff) -> spring. No React renders.
  const target = useTransform([mouseX, baseMV, magMV], ([x, base, mag]) => {
    if (!mag || !Number.isFinite(x)) return base;
    const el = ref.current;
    if (!el) return base;
    const r = el.getBoundingClientRect();
    const d = Math.abs(x - (r.left + r.width / 2));
    const range = base * RANGE;
    if (d >= range) return base;
    const falloff = (Math.cos((d / range) * Math.PI) + 1) / 2;
    return base * (1 + (MAX_SCALE - 1) * falloff * falloff);
  });
  const spring = useSpring(target, SPRING);
  const width = reduceMotion ? target : spring;

  const click = () => {
    const bounce = onActivate(id);
    if (bounce && !reduceMotion) {
      const h = baseMV.get();
      controls.start({
        y: [0, -h * 0.46, 0, -h * 0.2, 0],
        transition: {
          duration: 0.85,
          times: [0, 0.26, 0.52, 0.76, 1],
          ease: ["easeOut", "easeIn", "easeOut", "easeIn"],
        },
      });
    }
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      className="dock-item"
      data-dock-app={id}
      data-running={running || undefined}
      aria-label={badge ? `${label}, ${badge} item${badge === 1 ? "" : "s"}` : label}
      style={{ width }}
      initial={entering && !reduceMotion ? { opacity: 0, scale: 0.4 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      onClick={click}
      onContextMenu={(e) => onMenu(e, id)}
    >
      <motion.span className="dock-item-lift" animate={controls}>
        <img src={icon} alt="" draggable={false} decoding="async" />
        {badge ? <span className="dock-badge">{badge > 99 ? "99+" : badge}</span> : null}
        <span className="dock-tip" role="presentation">
          {label}
        </span>
      </motion.span>
      <span className="dock-dot" aria-hidden="true" />
    </motion.button>
  );
});

export default function Dock() {
  const dockSize = useSettings((s) => s.dockSize);
  const magnifySetting = useSettings((s) => s.dockMagnify);
  const autoHide = useSettings((s) => s.dockAutoHide);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const activeMax = useActiveMaximized();
  const runningKey = useWindows((s) => {
    const ids = [];
    for (const w of s.windows) if (!w.closing && !ids.includes(w.appId)) ids.push(w.appId);
    return ids.join(",");
  });
  const hasActive = useWindows((s) => {
    const w = s.windows.find((x) => x.id === s.activeId);
    return !!w && !w.minimized && !w.closing;
  });
  const vw = useViewportWidth();
  useFs();
  const trashCount = fs.list(TRASH, { hidden: true }).length;

  // ---- items ----------------------------------------------------------------
  const items = useMemo(() => {
    const running = runningKey ? runningKey.split(",") : [];
    const pinned = dockApps();
    const toItem = (a, extra) => ({
      id: a.id,
      label: a.name,
      icon: a.icon,
      running: running.includes(a.id),
      extra,
    });
    const launchpad = { id: "launchpad", label: "Launchpad", icon: SYSTEM_ICONS.launchpad };
    const finder = pinned.filter((a) => a.id === "finder").map((a) => toItem(a));
    const rest = pinned.filter((a) => a.id !== "finder").map((a) => toItem(a));
    const extras = running
      .map(getApp)
      .filter((a) => a && !a.dock)
      .map((a) => toItem(a, true));
    return [
      ...finder,
      launchpad,
      ...rest,
      { sep: "sep-running" },
      ...extras,
      extras.length ? { sep: "sep-trash" } : null,
      { id: "trash", label: "Trash", icon: SYSTEM_ICONS.trash },
    ].filter(Boolean);
  }, [runningKey]);

  // ---- sizing ---------------------------------------------------------------
  const mobile = vw < MOBILE_BREAKPOINT;
  const count = items.filter((i) => !i.sep).length;
  const seps = items.length - count;
  const fit = Math.floor((vw - 16 - 14 - (items.length - 1) * GAP - seps * SEP_W) / count);
  const base = Math.max(MIN_ICON, Math.min(dockSize, fit));
  const magnify = magnifySetting && !reduceMotion && !mobile;

  const mouseX = useMotionValue(Infinity);
  const baseMV = useMotionValue(base);
  const magMV = useMotionValue(magnify ? 1 : 0);
  useEffect(() => {
    baseMV.set(base);
    magMV.set(magnify ? 1 : 0);
  }, [base, magnify, baseMV, magMV]);

  // ---- auto-hide ------------------------------------------------------------
  const shouldHide = autoHide || activeMax || (mobile && hasActive);
  const [revealed, setRevealed] = useState(false);
  const timer = useRef(0);
  const reveal = useCallback(() => {
    clearTimeout(timer.current);
    setRevealed(true);
  }, []);
  const scheduleHide = useCallback((delay = 380) => {
    clearTimeout(timer.current);
    const tick = () => {
      // Keep the dock up while one of its context menus is open.
      if (useUI.getState().contextMenu) timer.current = setTimeout(tick, 380);
      else setRevealed(false);
    };
    timer.current = setTimeout(tick, delay);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hidden = shouldHide && !revealed;
  const leaveDelay = (e) => (e.pointerType === "mouse" ? 380 : 2600);

  // ---- actions --------------------------------------------------------------
  const mobileRef = useRef(mobile);
  useEffect(() => {
    mobileRef.current = mobile;
  }, [mobile]);

  /** Returns true when the icon should bounce (the app was just launched). */
  const onActivate = useCallback((id) => {
    ui.hideContextMenu();
    if (mobileRef.current) {
      clearTimeout(timer.current);
      setRevealed(false);
    }
    if (id === "launchpad") {
      ui.toggleOverlay("launchpad");
      return false;
    }
    if (id === "trash") {
      wm.open("finder", { path: TRASH });
      return false;
    }
    const wasRunning = wm.windows.some((w) => w.appId === id && !w.closing);
    wm.toggleApp(id);
    return !wasRunning;
  }, []);

  const onMenu = useCallback((e, id) => {
    if (id === "launchpad") {
      return contextMenu(e, [
        { label: "Open Launchpad", onClick: () => ui.setOverlay("launchpad") },
        { label: "Mission Control", onClick: () => ui.setOverlay("missionControl") },
      ]);
    }
    if (id === "trash") return contextMenu(e, trashMenu());
    const app = getApp(id);
    if (app) contextMenu(e, appMenu(app));
  }, []);

  return (
    <>
      <div
        className="dock-sensor"
        data-armed={shouldHide || undefined}
        data-handle={(hidden && mobile) || undefined}
        aria-hidden="true"
        onPointerEnter={reveal}
        onPointerDown={reveal}
        onPointerLeave={(e) => scheduleHide(leaveDelay(e))}
      />
      <div className="dock-layer">
        <motion.div
          className="dock-slide"
          data-hidden={hidden || undefined}
          initial={false}
          animate={{ y: hidden ? base + 56 : 0 }}
          transition={
            reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 34, mass: 0.9 }
          }
          onPointerEnter={reveal}
          onPointerLeave={(e) => {
            mouseX.set(Infinity);
            scheduleHide(leaveDelay(e));
          }}
          onFocusCapture={(e) => {
            if (e.target.matches?.(":focus-visible")) reveal();
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) scheduleHide();
          }}
        >
          <div
            className="dock"
            data-dock-root
            data-compact={mobile || undefined}
            role="toolbar"
            aria-label="Dock"
            style={{ "--dock-base": `${base}px` }}
            onPointerMove={(e) => {
              if (e.pointerType === "mouse") mouseX.set(e.clientX);
            }}
            onContextMenu={(e) => contextMenu(e, dockMenu())}
          >
            <div className="dock-track">
              {items.map((item) =>
                item.sep ? (
                  <span key={item.sep} className="dock-sep" aria-hidden="true" />
                ) : (
                  <DockItem
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    icon={item.icon}
                    running={item.running}
                    entering={item.extra}
                    badge={item.id === "trash" ? trashCount : 0}
                    reduceMotion={reduceMotion}
                    mouseX={mouseX}
                    baseMV={baseMV}
                    magMV={magMV}
                    onActivate={onActivate}
                    onMenu={onMenu}
                  />
                )
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
