// Pointer-driven interactions that must not re-render React while they run:
// dragging files onto folders, and the rubber-band selection rectangle.
import fs, { TRASH, basename, dirname, join } from "../../os/fs";
import { notify } from "../../os/ui";
import { inTrash } from "./util";

const THRESHOLD = 5;
let suppressClick = false;

/** True (once) when the click that follows a pointer-up belonged to a drag. */
export function consumeDragClick() {
  const v = suppressClick;
  suppressClick = false;
  return v;
}

/** Move (or trash) paths into a destination folder. */
export function dropInto(paths, dest) {
  let moved = 0;
  for (const p of paths) {
    const res = dest === TRASH ? fs.trash(p) : fs.move(p, join(dest, basename(p)));
    if (res) moved++;
  }
  if (!moved && paths.length) {
    notify({
      title: "Can't move item",
      body: paths.length === 1 ? `"${basename(paths[0])}" can't be moved there.` : "These items can't be moved there.",
    });
  }
  return moved;
}

/**
 * Track a potential file drag starting from a pointerdown.
 * Drop targets are any element with data-finder-drop="<folder path>" (in any Finder window).
 */
export function startItemDrag(e, paths) {
  if (!paths.length) return;
  const sx = e.clientX;
  const sy = e.clientY;
  let ghost = null;
  let target = null;
  let raf = 0;
  let last = e;

  const blocked = (dest) =>
    paths.some((p) => dest === p || dest.startsWith(p + "/")) ||
    paths.every((p) => dirname(p) === dest) ||
    (inTrash(dest) && dest !== TRASH) ||
    (dest === TRASH && paths.every(inTrash));

  const setTarget = (el) => {
    if (el === target) return;
    target?.removeAttribute("data-drop-hover");
    target = el;
    target?.setAttribute("data-drop-hover", "");
  };

  const frame = () => {
    raf = 0;
    if (!ghost) return;
    ghost.style.transform = `translate3d(${last.clientX + 14}px, ${last.clientY + 12}px, 0)`;
    let el = document.elementFromPoint(last.clientX, last.clientY)?.closest("[data-finder-drop]") || null;
    while (el && blocked(el.dataset.finderDrop)) {
      el = el.parentElement?.closest("[data-finder-drop]") || null;
    }
    setTarget(el);
  };

  const begin = () => {
    ghost = document.createElement("div");
    ghost.className = "finder-drag-ghost";
    const label = document.createElement("span");
    label.className = "finder-drag-ghost-label";
    label.textContent = basename(paths[0]);
    ghost.appendChild(label);
    if (paths.length > 1) {
      const badge = document.createElement("span");
      badge.className = "finder-drag-ghost-badge";
      badge.textContent = String(paths.length);
      ghost.appendChild(badge);
    }
    document.body.appendChild(ghost);
    document.body.style.cursor = "grabbing";
  };

  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey, true);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    setTarget(null);
    if (ghost) {
      ghost.remove();
      document.body.style.cursor = "";
    }
    ghost = null;
  };

  function onMove(ev) {
    last = ev;
    if (!ghost) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return;
      begin();
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function onUp() {
    const dragging = !!ghost;
    if (dragging) {
      if (raf) cancelAnimationFrame(raf);
      frame();
      suppressClick = true;
      // the click (if any) fires right after pointerup; never let the flag outlive it
      setTimeout(() => (suppressClick = false), 0);
    }
    const dest = target?.dataset.finderDrop;
    cleanup();
    if (dragging && dest) dropInto(paths, dest);
  }
  function onCancel() {
    cleanup();
  }
  function onKey(ev) {
    if (ev.key !== "Escape" || !ghost) return;
    ev.stopPropagation();
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 400);
    cleanup();
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKey, true);
}

/**
 * Rubber-band selection inside a scroll container (position: relative).
 * Marks hit items with data-band while dragging and reports the final paths on release.
 */
export function startRubberBand(e, scroller, onCommit) {
  const box = () => scroller.getBoundingClientRect();
  const toContent = (ev) => {
    const r = box();
    return {
      x: ev.clientX - r.left + scroller.scrollLeft,
      y: ev.clientY - r.top + scroller.scrollTop,
    };
  };
  const start = toContent(e);
  const maxW = scroller.scrollWidth;
  const maxH = scroller.scrollHeight;
  let band = null;
  let cells = [];
  let hit = new Set();
  let raf = 0;
  let last = e;

  const begin = () => {
    const r = box();
    cells = [...scroller.querySelectorAll("[data-path]")].map((el) => {
      const c = el.getBoundingClientRect();
      return {
        el,
        path: el.dataset.path,
        l: c.left - r.left + scroller.scrollLeft,
        t: c.top - r.top + scroller.scrollTop,
        r: c.right - r.left + scroller.scrollLeft,
        b: c.bottom - r.top + scroller.scrollTop,
      };
    });
    band = document.createElement("div");
    band.className = "finder-band";
    scroller.appendChild(band);
  };

  const frame = () => {
    raf = 0;
    if (!band) return;
    // auto-scroll near the top/bottom edges
    const r = box();
    const edge = 28;
    if (last.clientY > r.bottom - edge) scroller.scrollTop += Math.min(18, (last.clientY - (r.bottom - edge)) / 2);
    else if (last.clientY < r.top + edge) scroller.scrollTop -= Math.min(18, (r.top + edge - last.clientY) / 2);

    const cur = toContent(last);
    const x1 = Math.max(0, Math.min(start.x, cur.x));
    const y1 = Math.max(0, Math.min(start.y, cur.y));
    const x2 = Math.min(maxW, Math.max(start.x, cur.x));
    const y2 = Math.min(maxH, Math.max(start.y, cur.y));
    band.style.transform = `translate3d(${x1}px, ${y1}px, 0)`;
    band.style.width = `${Math.max(0, x2 - x1)}px`;
    band.style.height = `${Math.max(0, y2 - y1)}px`;

    const next = new Set();
    for (const c of cells) {
      const inside = c.l < x2 && c.r > x1 && c.t < y2 && c.b > y1;
      if (inside) next.add(c.path);
      if (inside !== hit.has(c.path)) {
        if (inside) c.el.setAttribute("data-band", "");
        else c.el.removeAttribute("data-band");
      }
    }
    hit = next;
    // keep running while the pointer rests in an auto-scroll zone
    if (last.clientY > r.bottom - edge || last.clientY < r.top + edge) raf = requestAnimationFrame(frame);
  };

  function onMove(ev) {
    last = ev;
    if (!band) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
      begin();
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (raf) cancelAnimationFrame(raf);
    if (!band) return;
    raf = 0;
    frame();
    if (raf) cancelAnimationFrame(raf);
    for (const c of cells) c.el.removeAttribute("data-band");
    band.remove();
    band = null;
    onCommit(cells.filter((c) => hit.has(c.path)).map((c) => c.path));
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}
