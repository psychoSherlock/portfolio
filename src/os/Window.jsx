// A single OS window: chrome, drag, resize, snap, minimize/maximize/close animations.
// Drag & resize mutate the DOM directly (no React renders per frame) and commit to the store on release.
import React, { memo, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getApp } from "./apps";
import { wm, MENUBAR_H, MOBILE_BREAKPOINT } from "./windowStore";
import { useSettings } from "./settingsStore";

const NO_DRAG = "button,a,input,textarea,select,[data-no-drag],[contenteditable='true']";
const SNAP_EDGE = 4;

function useViewport() {
  const get = () => ({ w: window.innerWidth, h: window.innerHeight - MENUBAR_H });
  const [vp, setVp] = useState(get);
  useEffect(() => {
    const on = () => setVp(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="os-window-crash">
        <div className="os-window-crash-title">{this.props.name} quit unexpectedly</div>
        <pre>{String(this.state.error?.message || this.state.error)}</pre>
        <button className="os-btn" onClick={() => this.setState({ error: null })}>
          Reopen
        </button>
      </div>
    );
  }
}

function snapPreview(zone, vp) {
  const el = document.getElementById("os-snap-preview");
  if (!el) return;
  if (!zone) {
    el.dataset.show = "false";
    return;
  }
  const half = Math.round(vp.w / 2);
  const r =
    zone === "left" ? [0, half] : zone === "right" ? [half, vp.w - half] : [0, vp.w];
  el.style.left = `${r[0] + 6}px`;
  el.style.width = `${r[1] - 12}px`;
  el.dataset.show = "true";
}

function dockTarget(appId) {
  const el =
    document.querySelector(`[data-dock-app="${appId}"]`) ||
    document.querySelector("[data-dock-root]");
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight - 30 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function Window({ win, active }) {
  const app = getApp(win.appId);
  const vp = useViewport();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const mobile = vp.w < MOBILE_BREAKPOINT;
  const elRef = useRef(null);
  const [geomAnim, setGeomAnim] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [minTarget, setMinTarget] = useState({ x: 0, y: 0 });

  const full = mobile || win.maximized;
  const half = Math.round(vp.w / 2);
  const rect = full
    ? { x: 0, y: 0, w: vp.w, h: vp.h }
    : win.snap === "left"
    ? { x: 0, y: 0, w: half, h: vp.h }
    : win.snap === "right"
    ? { x: half, y: 0, w: vp.w - half, h: vp.h }
    : { x: win.x, y: win.y, w: win.w, h: win.h };
  const rectRef = useRef(rect);
  rectRef.current = rect;

  // Animate geometry only when the layout mode changes (never while dragging).
  const mode = full ? "max" : win.snap || "free";
  const firstMode = useRef(true);
  useLayoutEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    setGeomAnim(true);
    const t = setTimeout(() => setGeomAnim(false), 340);
    return () => clearTimeout(t);
  }, [mode]);

  // Minimize / restore: fly towards the app's dock icon.
  useLayoutEffect(() => {
    if (win.minimized) {
      const t = dockTarget(win.appId);
      const r = rectRef.current;
      setMinTarget({
        x: t.x - (r.x + r.w / 2),
        y: t.y - (r.y + MENUBAR_H + r.h / 2),
      });
    } else {
      setHidden(false);
    }
  }, [win.minimized, win.appId]);

  // Keep free windows reachable when the viewport shrinks.
  useEffect(() => {
    if (full || win.snap) return;
    const maxX = Math.max(0, vp.w - 80);
    const maxY = Math.max(0, vp.h - 40);
    if (win.x > maxX || win.y > maxY) {
      wm.setRect(win.id, { x: Math.min(win.x, maxX), y: Math.min(win.y, maxY) });
    }
  }, [vp.w, vp.h, full, win.snap, win.x, win.y, win.id]);

  const state = win.closing ? "closing" : win.minimized ? "minimized" : "open";
  const dur = (d) => (reduceMotion ? 0 : d);
  const variants = {
    initial: { opacity: 0, scale: 0.94, x: 0, y: 0 },
    open: {
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      transition: reduceMotion
        ? { duration: 0 }
        : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 },
    },
    minimized: {
      opacity: 0,
      scale: 0.06,
      x: minTarget.x,
      y: minTarget.y,
      transition: { duration: dur(0.36), ease: [0.5, 0, 0.3, 1] },
    },
    closing: {
      opacity: 0,
      scale: 0.94,
      transition: { duration: dur(0.14), ease: "easeIn" },
    },
  };

  // ---- drag ---------------------------------------------------------------
  const startDrag = (e) => {
    if (e.button !== 0 || mobile) return;
    if (!e.target.closest("[data-window-drag]") || e.target.closest(NO_DRAG)) return;
    const el = elRef.current;
    const sx = e.clientX;
    const sy = e.clientY;
    let { x, y, w, h } = rectRef.current;
    let wasDocked = win.maximized || !!win.snap;
    let moved = false;
    let zone = null;
    let raf = 0;
    let last = e;

    const frame = () => {
      raf = 0;
      const dx = last.clientX - sx;
      const dy = last.clientY - sy;
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) < 5) return;
        moved = true;
        document.body.classList.add("os-dragging");
        if (wasDocked) {
          // Tear the window off: restore its free size under the cursor.
          const ratio = (sx - x) / w;
          w = Math.min(win.w, vp.w);
          h = Math.min(win.h, vp.h);
          x = sx - w * ratio;
          y = 0;
          el.style.width = `${w}px`;
          el.style.height = `${h}px`;
        }
      }
      const nx = Math.max(-w + 90, Math.min(vp.w - 90, x + dx));
      const ny = Math.max(0, Math.min(vp.h - 40, y + dy));
      el.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;
      const z =
        last.clientY <= MENUBAR_H + SNAP_EDGE
          ? "max"
          : last.clientX <= SNAP_EDGE
          ? "left"
          : last.clientX >= window.innerWidth - SNAP_EDGE
          ? "right"
          : null;
      if (z !== zone) {
        zone = z;
        snapPreview(zone, vp);
      }
      el._pos = { x: Math.round(nx), y: Math.round(ny) };
    };
    const onMove = (ev) => {
      last = ev;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (raf) cancelAnimationFrame(raf), frame();
      document.body.classList.remove("os-dragging");
      snapPreview(null, vp);
      if (!moved) return;
      const pos = el._pos || { x, y };
      if (zone === "max") {
        wm.setRect(win.id, { maximized: true, snap: null });
      } else if (zone) {
        wm.setSnap(win.id, zone);
      } else {
        wm.setRect(win.id, { ...pos, w: Math.round(w), h: Math.round(h), maximized: false, snap: null });
      }
      // Re-sync inline styles with React-owned values after a docked re-drop.
      requestAnimationFrame(() => {
        const r = rectRef.current;
        el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
        el.style.width = `${r.w}px`;
        el.style.height = `${r.h}px`;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onDoubleClick = (e) => {
    if (mobile) return;
    if (!e.target.closest("[data-window-drag]") || e.target.closest(NO_DRAG)) return;
    wm.toggleMaximize(win.id);
  };

  // ---- resize -------------------------------------------------------------
  const startResize = (dir) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = elRef.current;
    const sx = e.clientX;
    const sy = e.clientY;
    const start = { ...rectRef.current };
    const min = app?.minSize || { w: 320, h: 220 };
    let next = start;
    let raf = 0;
    let last = e;
    document.body.classList.add("os-dragging");
    document.body.style.cursor = getComputedStyle(e.currentTarget).cursor;

    const frame = () => {
      raf = 0;
      const dx = last.clientX - sx;
      const dy = last.clientY - sy;
      let { x, y, w, h } = start;
      if (dir.includes("e")) w = Math.max(min.w, start.w + dx);
      if (dir.includes("s")) h = Math.max(min.h, Math.min(vp.h - start.y, start.h + dy));
      if (dir.includes("w")) {
        w = Math.max(min.w, start.w - dx);
        x = start.x + start.w - w;
      }
      if (dir.includes("n")) {
        h = Math.max(min.h, Math.min(start.y + start.h, start.h - dy));
        y = start.y + start.h - h;
      }
      next = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
      el.style.width = `${next.w}px`;
      el.style.height = `${next.h}px`;
    };
    const onMove = (ev) => {
      last = ev;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (raf) cancelAnimationFrame(raf), frame();
      document.body.classList.remove("os-dragging");
      document.body.style.cursor = "";
      wm.setRect(win.id, { ...next, snap: null, maximized: false });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  if (!app) return null;
  const AppComponent = app.component;
  const unified = app.chrome === "unified";
  const resizable = !full && !win.snap && !mobile;

  return (
    <div
      ref={elRef}
      className={[
        "os-window",
        active && "os-window--active",
        full && "os-window--max",
        win.snap && "os-window--snap",
        geomAnim && "os-window--geom-anim",
        hidden && "os-window--hidden",
        unified ? "os-window--unified" : "os-window--titled",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
        width: rect.w,
        height: rect.h,
        zIndex: win.z,
      }}
      data-window-id={win.id}
      data-app={win.appId}
      onPointerDownCapture={() => wm.focus(win.id)}
      onPointerDown={startDrag}
      onDoubleClick={onDoubleClick}
      role="dialog"
      aria-label={win.title}
    >
      <motion.div
        className="os-window-frame"
        variants={variants}
        initial="initial"
        animate={state}
        onAnimationComplete={(def) => {
          if (def === "closing") wm.remove(win.id);
          if (def === "minimized") setHidden(true);
        }}
      >
        <div className="os-traffic" data-no-drag>
          <button
            className="os-traffic-btn os-traffic-close"
            aria-label="Close"
            onClick={() => wm.close(win.id)}
          >
            <svg viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" /></svg>
          </button>
          <button
            className="os-traffic-btn os-traffic-min"
            aria-label="Minimize"
            onClick={() => wm.minimize(win.id)}
          >
            <svg viewBox="0 0 12 12"><path d="M2.5 6h7" /></svg>
          </button>
          <button
            className="os-traffic-btn os-traffic-max"
            aria-label="Zoom"
            disabled={mobile}
            onClick={() => wm.toggleMaximize(win.id)}
          >
            <svg viewBox="0 0 12 12"><path d="M3.5 6.5v2h2M8.5 5.5v-2h-2" /></svg>
          </button>
        </div>
        {!unified && (
          <div className="os-titlebar" data-window-drag>
            <span className="os-titlebar-title">{win.title}</span>
          </div>
        )}
        <div className="os-window-content">
          <ErrorBoundary name={app.name}>
            <Suspense fallback={<div className="os-window-loading"><span className="os-spinner" /></div>}>
              <AppComponent windowId={win.id} propsVersion={win.propsVersion} {...win.props} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </motion.div>
      {resizable &&
        ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => (
          <div key={d} className={`os-resize os-resize-${d}`} onPointerDown={startResize(d)} />
        ))}
    </div>
  );
}

export default memo(Window);
