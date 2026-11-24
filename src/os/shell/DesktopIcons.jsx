// Desktop icons: the contents of ~/Desktop on a snapping grid that fills from the top-right.
// Drag to rearrange (positions persist per path), rubber-band select, inline rename.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LuExternalLink, LuFolderOpen, LuPencil, LuCopy, LuSquareTerminal, LuTrash2 } from "react-icons/lu";
import fs, { DESKTOP, TRASH, basename, dirname, join, useFs } from "../fs";
import { openPath } from "../open";
import { useSettings } from "../settingsStore";
import { contextMenu, notify, ui } from "../ui";
import { MENUBAR_H, MOBILE_BREAKPOINT, useWindows, wm } from "../windowStore";
import { desk, useDesk } from "./system/sysStore";
import { deskUI, useDeskUI } from "./dock/deskState";
import DeskIcon from "./dock/DeskIcon";
import "./dock/desktop.css";

const CELL_W = 92;
const CELL_H = 100;
const M_CELL_W = 80;
const M_CELL_H = 92;
const TOP = MENUBAR_H + 10;
const SIDE = 10;
const DRAG_THRESHOLD = 4;

const HIDDEN_EXT = new Set(["app", "webloc", "url"]);
/** Finder-style display name: .app / .webloc extensions are hidden. */
const displayName = (item) =>
  item.type === "file" && HIDDEN_EXT.has(item.ext) ? item.name.slice(0, -(item.ext.length + 1)) : item.name;

const KIND_ORDER = ["dir", "app", "link", "pdf", "markdown", "text", "code", "image", "audio", "video", "unknown"];
function sortItems(list, sort) {
  if (sort === "date") return [...list].sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  if (sort === "kind")
    return [...list].sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
  return list; // fs.list: folders first, natural name order
}

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

const cellKey = (c, r) => `${c},${r}`;

/** Grid geometry for the current viewport. */
function makeGrid(vw, vh, dockSize, mobile) {
  if (mobile) {
    const cols = Math.max(1, Math.floor((vw - 16) / M_CELL_W));
    return {
      mobile,
      cols,
      rows: Infinity,
      cw: M_CELL_W,
      ch: M_CELL_H,
      x: (c) => 8 + c * M_CELL_W,
      y: (r) => TOP + r * M_CELL_H,
    };
  }
  const rows = Math.max(1, Math.floor((vh - TOP - (dockSize + 34)) / CELL_H));
  const cols = Math.max(1, Math.floor((vw - SIDE * 2) / CELL_W));
  return {
    mobile,
    cols,
    rows,
    cw: CELL_W,
    ch: CELL_H,
    x: (c) => vw - SIDE - (c + 1) * CELL_W,
    y: (r) => TOP + r * CELL_H,
    toCell: (x, y) => ({
      c: Math.min(cols - 1, Math.max(0, Math.round((vw - SIDE - CELL_W - x) / CELL_W))),
      r: Math.min(rows - 1, Math.max(0, Math.round((y - TOP) / CELL_H))),
    }),
  };
}

/** Place every item: saved cells first, then fill free cells column by column from the top-right. */
function computeLayout(items, positions, grid) {
  const out = new Map();
  if (grid.mobile) {
    items.forEach((it, i) => {
      const c = i % grid.cols;
      const r = Math.floor(i / grid.cols);
      out.set(it.path, { c, r, x: grid.x(c), y: grid.y(r) });
    });
    return out;
  }
  const taken = new Set();
  const pending = [];
  for (const it of items) {
    const p = positions[it.path];
    if (p && p.c >= 0 && p.c < grid.cols && p.r >= 0 && p.r < grid.rows && !taken.has(cellKey(p.c, p.r))) {
      taken.add(cellKey(p.c, p.r));
      out.set(it.path, { c: p.c, r: p.r });
    } else pending.push(it);
  }
  let c = 0;
  let r = 0;
  for (const it of pending) {
    while (taken.has(cellKey(c, r))) {
      r++;
      if (r >= grid.rows) (r = 0), c++;
    }
    taken.add(cellKey(c, r));
    out.set(it.path, { c, r });
  }
  for (const v of out.values()) {
    v.x = grid.x(v.c);
    v.y = grid.y(v.r);
  }
  return out;
}

/** Nearest free cell to (c, r) by grid distance. */
function nearestFree(c, r, taken, grid) {
  if (!taken.has(cellKey(c, r))) return { c, r };
  const max = Math.max(grid.cols, grid.rows);
  for (let d = 1; d <= max; d++) {
    let best = null;
    for (let dc = -d; dc <= d; dc++) {
      for (let dr = -d; dr <= d; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows || taken.has(cellKey(nc, nr))) continue;
        const dist = dc * dc + dr * dr;
        if (!best || dist < best.dist) best = { c: nc, r: nr, dist };
      }
    }
    if (best) return best;
  }
  return { c, r };
}

function dropTargetAt(x, y, paths) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const trash = el.closest('[data-dock-app="trash"]');
  if (trash) return { el: trash, dest: TRASH };
  let t = el.closest("[data-finder-drop]");
  while (t) {
    const dest = t.dataset.finderDrop;
    const blocked =
      paths.some((p) => dest === p || dest.startsWith(p + "/")) || paths.every((p) => dirname(p) === dest);
    if (!blocked) return { el: t, dest };
    t = t.parentElement?.closest("[data-finder-drop]") || null;
  }
  return null;
}

function moveInto(paths, dest) {
  let moved = 0;
  for (const p of paths) if (dest === TRASH ? fs.trash(p) : fs.move(p, join(dest, basename(p)))) moved++;
  if (!moved && paths.length)
    notify({
      title: "Can't move item",
      body: paths.length === 1 ? `"${basename(paths[0])}" can't be moved there.` : "These items can't be moved there.",
    });
  return moved;
}

const openItems = (paths) => paths.forEach((p) => openPath(p));
const trashItems = (paths) => {
  paths.forEach((p) => fs.trash(p));
  deskUI.select([]);
};
function duplicateItems(paths) {
  const copies = paths
    .map((p) => {
      const st = fs.stat(p);
      if (!st) return null;
      const dot = st.type === "file" ? st.name.lastIndexOf(".") : -1;
      const stem = dot > 0 ? st.name.slice(0, dot) : st.name;
      const ext = dot > 0 ? st.name.slice(dot) : "";
      return fs.copy(p, join(dirname(p), `${stem} copy${ext}`));
    })
    .filter(Boolean);
  if (copies.length) deskUI.select(copies);
}

// ---- inline rename -----------------------------------------------------------
function RenameField({ item, onDone }) {
  const ref = useRef(null);
  const shown = displayName(item);
  const [value, setValue] = useState(shown);
  const done = useRef(false);
  const mountedAt = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    mountedAt.current = performance.now();
    el.focus({ preventScroll: true });
    const dot = item.type === "file" && shown === item.name ? shown.lastIndexOf(".") : -1;
    el.setSelectionRange(0, dot > 0 ? dot : shown.length);
  }, [item.path, item.type, item.name, shown]);

  const finish = (commit) => {
    if (done.current) return;
    done.current = true;
    let next = null;
    const name = value.trim().replace(/\//g, ":");
    if (commit && name && name !== shown) {
      const full = shown !== item.name ? `${name}.${item.ext}` : name;
      next = fs.rename(item.path, full);
      if (!next) notify({ title: "Can't rename item", body: `"${item.name}" can't be renamed.` });
    }
    onDone(item.path, next);
  };

  return (
    <textarea
      ref={ref}
      className="dicon-rename"
      value={value}
      rows={1}
      spellCheck={false}
      aria-label="Rename"
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ""))}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => {
        // A closing context menu may hand focus back right after we mount: keep editing.
        if (performance.now() - mountedAt.current < 250) {
          requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
          return;
        }
        finish(true);
      }}
    />
  );
}

// ---- one icon --------------------------------------------------------------
const Icon = memo(function Icon({ item, x, y, selected, renaming, mobile, setRef, onDown, onOpen, onMenu, onRenamed }) {
  const name = displayName(item);
  return (
    <div
      ref={(el) => setRef(item.path, el)}
      className="dicon"
      role="button"
      tabIndex={0}
      aria-label={name}
      aria-pressed={selected}
      title={item.name}
      data-desk-path={item.path}
      data-finder-drop={item.type === "dir" ? item.path : undefined}
      data-selected={selected || undefined}
      style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
      onPointerDown={(e) => onDown(e, item.path)}
      onClick={mobile ? () => onOpen(item.path) : undefined}
      onDoubleClick={mobile ? undefined : () => onOpen(item.path)}
      onContextMenu={(e) => onMenu(e, item)}
    >
      <div className="dicon-inner">
        <DeskIcon item={item} />
        {renaming ? (
          <RenameField item={item} onDone={onRenamed} />
        ) : (
          <span className="dicon-label">{name}</span>
        )}
      </div>
    </div>
  );
});

// ---- the layer -------------------------------------------------------------
export default function DesktopIcons() {
  const show = useSettings((s) => s.showDesktopIcons);
  const dockSize = useSettings((s) => s.dockSize);
  const fsVersion = useFs();
  const positions = useDesk((s) => s.positions);
  const sort = useDesk((s) => s.sort);
  const selected = useDeskUI((s) => s.selected);
  const renaming = useDeskUI((s) => s.renaming);
  const desktopFocused = useWindows((s) => s.activeId === null);
  const { w: vw, h: vh } = useViewport();
  const mobile = vw < MOBILE_BREAKPOINT;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fsVersion invalidates the listing
  const items = useMemo(() => sortItems(fs.list(DESKTOP), sort), [fsVersion, sort]);
  const grid = useMemo(() => makeGrid(vw, vh, dockSize, mobile), [vw, vh, dockSize, mobile]);
  const layout = useMemo(() => computeLayout(items, positions, grid), [items, positions, grid]);
  const [band, setBand] = useState(null);

  // Live values for window-level handlers.
  const live = useRef({});
  useEffect(() => {
    live.current = { items, layout, grid };
  });
  const els = useRef(new Map());
  const setRef = useCallback((path, el) => {
    if (el) els.current.set(path, el);
    else els.current.delete(path);
  }, []);

  // Drop stale selection / rename state when files disappear.
  useEffect(() => {
    const exists = new Set(items.map((i) => i.path));
    const sel = deskUI.selected;
    if (sel.some((p) => !exists.has(p))) deskUI.select(sel.filter((p) => exists.has(p)));
    if (deskUI.renaming && !exists.has(deskUI.renaming)) deskUI.stopRename();
  }, [items]);

  /** Persist the full layout (freezing auto-placed icons) with some cells overridden. */
  const savePositions = useCallback((override) => {
    const { items: list, layout: lay } = live.current;
    const next = {};
    for (const it of list) {
      const v = override[it.path] || lay.get(it.path);
      if (v) next[it.path] = { c: v.c, r: v.r };
    }
    flushSync(() => desk.setPositions(next));
  }, []);

  // ---- item drag -----------------------------------------------------------
  const onDown = useCallback(
    (e, path) => {
      if (e.button !== 0 || deskUI.renaming === path) return;
      e.stopPropagation();
      wm.blurAll();
      ui.hideContextMenu();
      let sel = deskUI.selected;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        sel = sel.includes(path) ? sel.filter((p) => p !== path) : [...sel, path];
        deskUI.select(sel);
        if (!sel.includes(path)) return;
      } else if (!sel.includes(path)) {
        sel = [path];
        deskUI.select(sel);
      }
      if (live.current.grid.mobile || e.pointerType === "touch") return;

      const paths = [path, ...sel.filter((p) => p !== path)];
      const sx = e.clientX;
      const sy = e.clientY;
      let started = false;
      let target = null;
      let raf = 0;
      let last = { x: sx, y: sy };

      const inner = (p) => els.current.get(p)?.firstElementChild;
      const setTarget = (t) => {
        if (t?.el === target?.el) return;
        target?.el.removeAttribute("data-drop-hover");
        target = t;
        target?.el.setAttribute("data-drop-hover", "");
      };
      const frame = () => {
        raf = 0;
        const dx = last.x - sx;
        const dy = last.y - sy;
        for (const p of paths) {
          const el = inner(p);
          if (el) el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        }
        setTarget(dropTargetAt(last.x, last.y, paths));
      };
      const move = (ev) => {
        last = { x: ev.clientX, y: ev.clientY };
        if (!started) {
          if (Math.hypot(last.x - sx, last.y - sy) < DRAG_THRESHOLD) return;
          started = true;
          for (const p of paths) {
            els.current.get(p)?.setAttribute("data-dragging", "");
            const el = inner(p);
            if (el) el.style.transition = "none";
          }
        }
        if (!raf) raf = requestAnimationFrame(frame);
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key, true);
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        setTarget(null);
      };
      const settle = (residual) => {
        // FLIP: the outer node is now at its final cell; glide the inner offset back to zero.
        for (const p of paths) {
          const el = inner(p);
          if (!el) continue;
          el.style.transition = "none";
          el.style.transform = residual(p);
        }
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            for (const p of paths) {
              els.current.get(p)?.removeAttribute("data-dragging");
              const el = inner(p);
              if (!el) continue;
              el.style.transition = "";
              el.style.transform = "";
            }
          })
        );
      };
      const cancel = () => {
        cleanup();
        if (started) {
          const dx = last.x - sx;
          const dy = last.y - sy;
          settle(() => `translate3d(${dx}px, ${dy}px, 0)`);
        }
      };
      const key = (ev) => {
        if (ev.key === "Escape" && started) {
          ev.stopPropagation();
          cancel();
        }
      };
      function up(ev) {
        last = { x: ev.clientX, y: ev.clientY };
        if (!started) return cleanup();
        if (raf) cancelAnimationFrame(raf);
        frame();
        const drop = target;
        cleanup();
        const dx = last.x - sx;
        const dy = last.y - sy;
        if (drop && drop.dest !== DESKTOP) {
          if (moveInto(paths, drop.dest)) {
            deskUI.select([]);
            return;
          }
          return settle(() => `translate3d(${dx}px, ${dy}px, 0)`);
        }
        // Snap to the grid, resolving collisions with icons that stay put.
        const { layout: lay, grid: g } = live.current;
        const moving = new Set(paths);
        const taken = new Set();
        for (const [p, v] of lay) if (!moving.has(p)) taken.add(cellKey(v.c, v.r));
        const placed = {};
        const before = {};
        for (const p of paths) {
          const v = lay.get(p);
          if (!v) continue;
          before[p] = v;
          const want = g.toCell(v.x + dx, v.y + dy);
          const cell = nearestFree(want.c, want.r, taken, g);
          taken.add(cellKey(cell.c, cell.r));
          placed[p] = cell;
        }
        savePositions(placed);
        settle((p) => {
          const b = before[p];
          const n = placed[p];
          if (!b || !n) return "";
          return `translate3d(${b.x + dx - g.x(n.c)}px, ${b.y + dy - g.y(n.r)}px, 0)`;
        });
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key, true);
    },
    [savePositions]
  );

  // ---- rubber band on the wallpaper ------------------------------------------
  useEffect(() => {
    if (!show) return;
    const down = (e) => {
      if (e.button !== 0 || !(e.target instanceof Element) || !e.target.classList.contains("os-wallpaper")) return;
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      const base = additive ? deskUI.selected : [];
      if (!additive && deskUI.selected.length) deskUI.select([]);
      if (e.pointerType !== "mouse" || live.current.grid.mobile) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let raf = 0;
      let last = { x: sx, y: sy };
      let active = false;
      const frame = () => {
        raf = 0;
        const x1 = Math.min(sx, last.x);
        const y1 = Math.min(sy, last.y);
        const x2 = Math.max(sx, last.x);
        const y2 = Math.max(sy, last.y);
        setBand({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        const { layout: lay, grid: g } = live.current;
        const hit = [];
        for (const [p, v] of lay) {
          const l = v.x + 12;
          const t = v.y + 2;
          const r = v.x + g.cw - 12;
          const b = v.y + g.ch - 10;
          if (l < x2 && r > x1 && t < y2 && b > y1) hit.push(p);
        }
        const next = additive ? [...new Set([...base, ...hit])] : hit;
        const cur = deskUI.selected;
        if (next.length !== cur.length || next.some((p) => !cur.includes(p))) deskUI.select(next);
      };
      const move = (ev) => {
        last = { x: ev.clientX, y: ev.clientY };
        if (!active && Math.hypot(last.x - sx, last.y - sy) < DRAG_THRESHOLD) return;
        active = true;
        if (!raf) raf = requestAnimationFrame(frame);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (raf) cancelAnimationFrame(raf);
        setBand(null);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [show]);

  // ---- actions ---------------------------------------------------------------
  const onOpen = useCallback((path) => {
    const sel = deskUI.selected;
    openItems(sel.includes(path) ? sel : [path]);
  }, []);

  const onRenamed = useCallback(
    (oldPath, newPath) => {
      deskUI.stopRename();
      if (!newPath) return;
      const pos = desk.positions[oldPath];
      if (pos) {
        const next = { ...desk.positions, [newPath]: pos };
        delete next[oldPath];
        desk.setPositions(next);
      }
      deskUI.select([newPath]);
      // Keep keyboard focus on the renamed icon.
      requestAnimationFrame(() => els.current.get(newPath)?.focus({ preventScroll: true }));
    },
    []
  );

  const onMenu = useCallback((e, item) => {
    let sel = deskUI.selected;
    if (!sel.includes(item.path)) {
      sel = [item.path];
      deskUI.select(sel);
    }
    const n = sel.length;
    const many = n > 1;
    contextMenu(e, [
      {
        label: many ? `Open ${n} Items` : "Open",
        icon: item.kind === "link" ? LuExternalLink : LuFolderOpen,
        onClick: () => openItems(sel),
      },
      !many && item.type === "dir" && {
        label: "Open in Terminal",
        icon: LuSquareTerminal,
        onClick: () => wm.open("terminal", { cwd: item.path }),
      },
      { separator: true },
      !many && { label: "Rename", icon: LuPencil, shortcut: "↵", onClick: () => deskUI.startRename(item.path) },
      { label: many ? `Duplicate ${n} Items` : "Duplicate", icon: LuCopy, onClick: () => duplicateItems(sel) },
      { separator: true },
      {
        label: many ? `Move ${n} Items to Trash` : "Move to Trash",
        icon: LuTrash2,
        danger: true,
        shortcut: "⌫",
        onClick: () => trashItems(sel),
      },
    ]);
  }, []);

  const onKeyDown = (e) => {
    if (deskUI.renaming) return;
    const sel = deskUI.selected;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Enter" && !e.altKey && !mod) {
      if (sel.length === 1) {
        e.preventDefault();
        deskUI.startRename(sel[0]);
      }
    } else if ((mod && (e.key === "o" || e.key === "ArrowDown")) || (e.key === " " && sel.length)) {
      e.preventDefault();
      openItems(sel);
    } else if (e.key === "Delete" || (e.key === "Backspace" && (mod || !e.altKey))) {
      if (sel.length) {
        e.preventDefault();
        trashItems(sel);
      }
    } else if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      deskUI.select(items.map((i) => i.path));
    } else if (mod && e.key.toLowerCase() === "d" && sel.length) {
      e.preventDefault();
      duplicateItems(sel);
    } else if (e.key === "Escape" && sel.length) {
      deskUI.select([]);
    } else if (e.key.startsWith("Arrow") && !mod && !e.altKey) {
      e.preventDefault();
      const from = layout.get(sel[sel.length - 1] || "");
      if (!from) {
        const first = items[0];
        if (first) deskUI.select([first.path]), els.current.get(first.path)?.focus();
        return;
      }
      // Visual direction in grid units (columns count from the right on desktop).
      const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const [vx, vy] = dirs[e.key] || [0, 0];
      let best = null;
      for (const [p, v] of layout) {
        const dx = (v.x - from.x) / grid.cw;
        const dy = (v.y - from.y) / grid.ch;
        const along = dx * vx + dy * vy;
        if (along <= 0.01) continue;
        const across = Math.abs(dx * vy) + Math.abs(dy * vx);
        const score = along + across * 2.5;
        if (!best || score < best.score) best = { p, score };
      }
      if (best) {
        deskUI.select(e.shiftKey ? [...sel.filter((p) => p !== best.p), best.p] : [best.p]);
        els.current.get(best.p)?.focus({ preventScroll: true });
      }
    }
  };

  if (!show) return null;

  return (
    <div
      className="dicons"
      data-mobile={mobile || undefined}
      data-inactive={!desktopFocused || undefined}
      role="group"
      aria-label="Desktop"
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const v = layout.get(item.path);
        if (!v) return null;
        return (
          <Icon
            key={item.path}
            item={item}
            x={v.x}
            y={v.y}
            selected={selected.includes(item.path)}
            renaming={renaming === item.path}
            mobile={mobile}
            setRef={setRef}
            onDown={onDown}
            onOpen={onOpen}
            onMenu={onMenu}
            onRenamed={onRenamed}
          />
        );
      })}
      {band && band.w + band.h > 0 ? (
        <div
          className="dicons-band"
          style={{ transform: `translate3d(${band.x}px, ${band.y}px, 0)`, width: band.w, height: band.h }}
        />
      ) : null}
    </div>
  );
}
