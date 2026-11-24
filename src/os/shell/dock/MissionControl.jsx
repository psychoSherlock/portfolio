// Mission Control: every visible window shrinks into a proportional, labelled card.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion as Motion, useIsPresent } from "framer-motion";
import { LuX } from "react-icons/lu";
import { getApp } from "../../apps";
import { useSettings } from "../../settingsStore";
import { ui } from "../../ui";
import { MENUBAR_H, MOBILE_BREAKPOINT, useWindows, wm } from "../../windowStore";

const LABEL_H = 30;
const GAP = 28;

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

/** On-screen rect of a window, mirroring Window.jsx (maximized / snapped / phone). */
function screenRect(win, vp) {
  const h = vp.h - MENUBAR_H;
  if (vp.w < MOBILE_BREAKPOINT || win.maximized) return { x: 0, y: MENUBAR_H, w: vp.w, h };
  const half = Math.round(vp.w / 2);
  if (win.snap === "left") return { x: 0, y: MENUBAR_H, w: half, h };
  if (win.snap === "right") return { x: half, y: MENUBAR_H, w: vp.w - half, h };
  return { x: win.x, y: win.y + MENUBAR_H, w: win.w, h: win.h };
}

/** Pick the column count that maximises the total card area, then place cards row by row. */
function arrange(wins, vp) {
  const narrow = vp.w < 560;
  const padX = narrow ? 16 : 56;
  const top = MENUBAR_H + (narrow ? 24 : 56);
  const bottom = narrow ? 40 : 96;
  const W = Math.max(200, vp.w - padX * 2);
  const H = Math.max(200, vp.h - top - bottom);
  const n = wins.length;
  const rects = wins.map((w) => screenRect(w, vp));
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = W / cols;
    const ch = H / rows;
    let area = 0;
    const scales = rects.map((r) => {
      const s = Math.min((cw - GAP) / r.w, (ch - GAP - LABEL_H) / r.h, 0.62);
      area += s * s * r.w * r.h;
      return Math.max(0.05, s);
    });
    if (!best || area > best.area) best = { cols, rows, cw, ch, scales, area };
  }
  const { cols, cw, ch, scales } = best;
  return wins.map((win, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = Math.min(cols, n - row * cols);
    const offset = ((cols - inRow) * cw) / 2;
    const r = rects[i];
    const s = scales[i];
    const w = r.w * s;
    const h = r.h * s;
    const cx = padX + offset + col * cw + cw / 2;
    const cy = top + row * ch + (ch - LABEL_H) / 2;
    return { win, from: r, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
  });
}

function Card({ card, index, active, reduceMotion, onPick }) {
  const { win, from } = card;
  const app = getApp(win.appId);
  const title = win.title || app?.name || win.appId;
  const back = {
    x: from.x,
    y: from.y,
    scale: from.w / Math.max(1, card.w),
    opacity: 0,
  };
  const spring = reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 32, mass: 0.9 };
  return (
    <Motion.div
      className="mc-card"
      role="button"
      tabIndex={0}
      aria-label={`${title}${app && app.name !== title ? ` — ${app.name}` : ""}`}
      data-active={active || undefined}
      data-mc-index={index}
      style={{ width: card.w, height: card.h, transformOrigin: "0 0" }}
      initial={reduceMotion ? { x: card.x, y: card.y, scale: 1, opacity: 0 } : back}
      animate={{ x: card.x, y: card.y, scale: 1, opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { ...back, opacity: 1 }}
      transition={spring}
      onClick={(e) => {
        e.stopPropagation();
        onPick(win.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(win.id);
        }
      }}
    >
      <div className="mc-window">
        <div className="mc-titlebar">
          <span className="mc-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="mc-wtitle">{title}</span>
        </div>
        <div className="mc-body">
          {app?.icon ? <img src={app.icon} alt="" draggable={false} decoding="async" /> : null}
        </div>
      </div>
      <button
        type="button"
        className="mc-close"
        aria-label={`Close ${title}`}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          wm.close(win.id);
        }}
      >
        <LuX aria-hidden="true" />
      </button>
      <div className="mc-label">
        {app?.icon ? <img src={app.icon} alt="" draggable={false} decoding="async" /> : null}
        <span>{title}</span>
      </div>
    </Motion.div>
  );
}

export default function MissionControl() {
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const present = useIsPresent();
  const windows = useWindows((s) => s.windows);
  const activeId = useWindows((s) => s.activeId);
  const vp = useViewport();
  const rootRef = useRef(null);
  const [picked, setPicked] = useState(null);

  const visible = useMemo(() => windows.filter((w) => !w.minimized && !w.closing), [windows]);
  const minimizedCount = useMemo(() => windows.filter((w) => w.minimized && !w.closing).length, [windows]);
  const cards = useMemo(() => (visible.length ? arrange(visible, vp) : []), [visible, vp]);

  // Focus the active window's card (or the first) so the keyboard works immediately.
  useEffect(() => {
    const root = rootRef.current;
    const el = root?.querySelector(".mc-card[data-active]") || root?.querySelector(".mc-card");
    (el || root)?.focus({ preventScroll: true });
  }, []);

  const pick = (id) => {
    setPicked(id);
    wm.focus(id);
    ui.setOverlay(null);
  };

  const onKeyDown = (e) => {
    if (!e.key.startsWith("Arrow") || !cards.length) return;
    const cur = Number(document.activeElement?.dataset?.mcIndex ?? -1);
    const from = cards[cur];
    e.preventDefault();
    if (!from) {
      rootRef.current?.querySelector('[data-mc-index="0"]')?.focus();
      return;
    }
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const [vx, vy] = dirs[e.key];
    const fx = from.x + from.w / 2;
    const fy = from.y + from.h / 2;
    let best = null;
    cards.forEach((c, i) => {
      if (i === cur) return;
      const dx = c.x + c.w / 2 - fx;
      const dy = c.y + c.h / 2 - fy;
      const along = dx * vx + dy * vy;
      if (along <= 1) return;
      const score = along + (Math.abs(dx * vy) + Math.abs(dy * vx)) * 2;
      if (!best || score < best.score) best = { i, score };
    });
    if (best) rootRef.current?.querySelector(`[data-mc-index="${best.i}"]`)?.focus();
  };

  const fade = reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

  return (
    <Motion.div
      ref={rootRef}
      className="mc-root"
      role="dialog"
      aria-modal="true"
      aria-label="Mission Control"
      tabIndex={-1}
      data-exiting={!present || undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { ...fade, delay: reduceMotion ? 0 : 0.08 } }}
      transition={fade}
      onClick={() => ui.setOverlay(null)}
      onKeyDown={onKeyDown}
    >
      <div className="mc-backdrop" aria-hidden="true" />
      <div className="mc-head" aria-hidden="true">
        <span className="mc-pill">Desktop</span>
        <span className="mc-count">
          {visible.length} window{visible.length === 1 ? "" : "s"}
          {minimizedCount ? ` · ${minimizedCount} minimized` : ""}
        </span>
      </div>
      {cards.length === 0 ? (
        <p className="mc-empty">No open windows</p>
      ) : (
        cards.map((card, i) => (
          <Card
            key={card.win.id}
            card={card}
            index={i}
            active={card.win.id === (picked || activeId)}
            reduceMotion={reduceMotion}
            onPick={pick}
          />
        ))
      )}
    </Motion.div>
  );
}
