// Zoom / pan / rotate for a single image layer using CSS transforms only.
// The layer is laid out at its natural pixel size, centered in the stage, and
// transformed with translate3d + rotate + scale. All gesture updates are
// coalesced into one requestAnimationFrame write.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const MIN_FACTOR = 0.25; // relative to the fit scale
const MAX_SCALE = 8;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {{w:number,h:number}|null} natural  pixel size of the layer (null while unknown)
 * @param {string} resetKey                   changes when another image is shown
 * @param {{ pad?: number, onSwipe?: (dir: 1|-1) => void }} options
 */
export default function useZoomPan(natural, resetKey, { pad = 0, onSwipe } = {}) {
  const [stage, setStage] = useState(null);
  const layerRef = useRef(null);
  const st = useRef({ s: 1, x: 0, y: 0, rot: 0, fit: true, sw: 0, sh: 0 });
  const nat = useRef(null);
  const lastKey = useRef(null);
  const raf = useRef(0);
  const animTimer = useRef(0);
  const swipeRef = useRef(onSwipe);
  const [view, setView] = useState({ percent: 100, fit: true, rotation: 0 });

  useEffect(() => {
    swipeRef.current = onSwipe;
  });

  const setLayer = useCallback((el) => {
    // Ignore the null call from an exiting (cross-fading) layer.
    if (el) layerRef.current = el;
  }, []);

  const rotatedSize = () => {
    const n = nat.current;
    const odd = Math.abs(st.current.rot / 90) % 2 === 1;
    return odd ? { w: n.h, h: n.w } : { w: n.w, h: n.h };
  };

  const fitScale = useCallback(() => {
    const c = st.current;
    if (!nat.current || !c.sw || !c.sh) return 1;
    const r = rotatedSize();
    return Math.min(Math.max(c.sw - pad * 2, 40) / r.w, Math.max(c.sh - pad * 2, 40) / r.h);
  }, [pad]);

  const write = useCallback(() => {
    raf.current = 0;
    const c = st.current;
    const el = layerRef.current;
    if (!el || !nat.current) return;
    if (c.fit) {
      c.s = fitScale();
      c.x = 0;
      c.y = 0;
    } else {
      const r = rotatedSize();
      const mx = Math.max(0, (r.w * c.s - c.sw) / 2);
      const my = Math.max(0, (r.h * c.s - c.sh) / 2);
      c.x = clamp(c.x, -mx, mx);
      c.y = clamp(c.y, -my, my);
    }
    el.style.transform = `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) rotate(${c.rot}deg) scale(${c.s.toFixed(5)})`;
    const percent = Math.round(c.s * 100);
    setView((v) =>
      v.percent === percent && v.fit === c.fit && v.rotation === c.rot
        ? v
        : { percent, fit: c.fit, rotation: c.rot }
    );
  }, [fitScale]);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(write);
  }, [write]);

  /** Ease the next transform write (used by buttons / double-click, not by gestures). */
  const animate = useCallback(() => {
    const el = layerRef.current;
    if (!el) return;
    el.dataset.anim = "true";
    clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => {
      if (el) delete el.dataset.anim;
    }, 260);
  }, []);

  // New image / new natural size.
  useLayoutEffect(() => {
    const c = st.current;
    const prev = nat.current;
    nat.current = natural;
    if (!natural) return;
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      c.fit = true;
      c.rot = 0;
      c.x = 0;
      c.y = 0;
    } else if (prev && !c.fit && prev.w !== natural.w) {
      // thumbnail-sized stand-in replaced by the full image: keep the visual size
      c.s *= prev.w / natural.w;
    }
    if (raf.current) cancelAnimationFrame(raf.current);
    write();
  }, [natural, resetKey, write]);

  /** Zoom to an absolute scale keeping the stage point (cx, cy — relative to the stage center) fixed. */
  const zoomTo = useCallback(
    (next, cx = 0, cy = 0) => {
      const c = st.current;
      if (!nat.current) return;
      const fit = fitScale();
      const s = clamp(next, Math.min(fit * MIN_FACTOR, 0.05), Math.max(MAX_SCALE, fit));
      if (Math.abs(s - fit) < fit * 0.012 && s <= c.s) {
        c.fit = true;
      } else {
        const k = s / c.s;
        c.x = cx - (cx - c.x) * k;
        c.y = cy - (cy - c.y) * k;
        c.s = s;
        c.fit = false;
      }
      schedule();
    },
    [fitScale, schedule]
  );

  // Stage size tracking.
  useEffect(() => {
    if (!stage) return;
    const c = st.current;
    const measure = () => {
      c.sw = stage.clientWidth;
      c.sh = stage.clientHeight;
      schedule();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [stage, schedule]);

  // Wheel + pointer gestures.
  useEffect(() => {
    if (!stage) return;
    const c = st.current;
    const pointers = new Map();
    let pinch = null; // { dist, s }
    let drag = null; // { x, y, ox, oy, sx, sy, moved }

    const rel = (e) => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
    };

    const onWheel = (e) => {
      if (!nat.current) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      const dy = clamp(e.deltaY * unit, -240, 240);
      const p = rel(e);
      zoomTo(c.s * Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0022)), p.x, p.y);
    };

    const onDown = (e) => {
      if (e.button > 0 || e.target.closest("button,a,input")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY, ox: c.x, oy: c.y, sx: e.clientX, sy: e.clientY, moved: false };
        pinch = null;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: c.s };
        drag = null;
      }
    };

    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const r = stage.getBoundingClientRect();
        zoomTo(
          (pinch.s * dist) / pinch.dist,
          (a.x + b.x) / 2 - r.left - r.width / 2,
          (a.y + b.y) / 2 - r.top - r.height / 2
        );
      } else if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 3) {
          drag.moved = true;
          if (!c.fit) stage.dataset.panning = "true";
        }
        if (drag.moved && !c.fit) {
          c.x = drag.ox + dx;
          c.y = drag.oy + dy;
          schedule();
        }
      }
    };

    const onUp = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (drag && c.fit && swipeRef.current && e.type === "pointerup") {
        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;
        if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) swipeRef.current(dx < 0 ? 1 : -1);
      }
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        drag = null;
        delete stage.dataset.panning;
      } else if (pointers.size === 1) {
        const [a] = [...pointers.values()];
        drag = { x: a.x, y: a.y, ox: c.x, oy: c.y, sx: a.x, sy: a.y, moved: true };
      }
    };

    const onDbl = (e) => {
      if (!nat.current || e.target.closest("button,a,input")) return;
      const p = rel(e);
      animate();
      if (c.fit) {
        const fit = fitScale();
        zoomTo(fit < 0.98 ? 1 : fit * 2, p.x, p.y);
      } else {
        c.fit = true;
        schedule();
      }
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("dblclick", onDbl);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("dblclick", onDbl);
    };
  }, [stage, zoomTo, schedule, fitScale, animate]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(animTimer.current);
    },
    []
  );

  const zoomBy = useCallback(
    (factor) => {
      animate();
      zoomTo(st.current.s * factor);
    },
    [animate, zoomTo]
  );
  const setFit = useCallback(() => {
    animate();
    st.current.fit = true;
    schedule();
  }, [animate, schedule]);
  const setActual = useCallback(() => {
    animate();
    const c = st.current;
    c.fit = false;
    c.s = 1;
    c.x = 0;
    c.y = 0;
    schedule();
  }, [animate, schedule]);
  const rotate = useCallback(
    (dir) => {
      animate();
      const c = st.current;
      c.rot += dir * 90;
      c.fit = true;
      schedule();
    },
    [animate, schedule]
  );

  return { setStage, setLayer, ...view, zoomBy, setFit, setActual, rotate };
}
