// Glass pop-up menu used by the context menu and the menu-bar dropdowns.
// Never takes DOM focus (so text selections survive); keys arrive through the
// system key router (sysStore.onKeys). Must be rendered inside <AnimatePresence>.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePresence } from "framer-motion";
import { LuCheck, LuChevronRight } from "react-icons/lu";
import { onKeys } from "./sysStore";
import { renderIcon } from "./renderIcon";

const MARGIN = 6;
const FADE_MS = 90;

const clean = (items) => (Array.isArray(items) ? items.filter(Boolean) : []);
const subOf = (it) => {
  if (!it || it.separator || !it.submenu) return null;
  const sub = clean(typeof it.submenu === "function" ? it.submenu() : it.submenu);
  return sub.length ? sub : null;
};
const usable = (it) => !!it && !it.separator && !it.disabled;
const firstUsable = (list) => list.findIndex(usable);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The item lists for every open level of `path`. */
function levelsFor(list, path) {
  const out = [list];
  let cur = list;
  for (let d = 0; d < path.length - 1; d++) {
    const sub = subOf(cur[path[d]]);
    if (!sub) break;
    out.push(sub);
    cur = sub;
  }
  return out;
}

const Panel = memo(function Panel({ items, depth, active, parentIndex, x, y, origin, onHover, onLeave, onPick }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left;
    let top;
    if (depth === 0) {
      left = x;
      top = y;
      if (left + w > vw - MARGIN) left = origin === "context" ? x - w : vw - w - MARGIN;
      if (top + h > vh - MARGIN) top = origin === "context" && y - h >= MARGIN ? y - h : vh - h - MARGIN;
    } else {
      const parent = el.parentElement?.querySelector(`[data-depth="${depth - 1}"]`);
      const anchor = parent?.querySelector(`[data-index="${parentIndex}"]`);
      const pr = parent?.getBoundingClientRect() || { left: 0, right: 0, top: 0 };
      const ar = anchor?.getBoundingClientRect() || pr;
      left = pr.right - 3;
      if (left + w > vw - MARGIN) left = pr.left - w + 3;
      top = ar.top - 5;
      if (top + h > vh - MARGIN) top = vh - h - MARGIN;
    }
    setPos({ left: Math.round(Math.max(MARGIN, left)), top: Math.round(Math.max(MARGIN, top)) });
  }, [x, y, origin, depth, parentIndex, items]);

  // Keep the keyboard-highlighted row visible when the menu itself scrolls.
  useEffect(() => {
    const el = ref.current;
    if (!el || active < 0 || el.scrollHeight <= el.clientHeight) return;
    const row = el.querySelector(`[data-index="${active}"]`);
    if (!row) return;
    if (row.offsetTop < el.scrollTop) el.scrollTop = row.offsetTop - 5;
    else if (row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight)
      el.scrollTop = row.offsetTop + row.offsetHeight - el.clientHeight + 5;
  }, [active]);

  const hasCheck = items.some((it) => it.checked !== undefined);
  const hasIcon = items.some((it) => it.icon);

  return (
    <div
      ref={ref}
      role="menu"
      className="sys-menu"
      data-depth={depth}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
      onPointerLeave={() => onLeave(depth)}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="sys-menu-sep" role="separator" />
        ) : (
          <div
            key={i}
            role="menuitem"
            className="sys-menu-item"
            data-index={i}
            data-active={i === active}
            data-disabled={!!it.disabled}
            data-danger={!!it.danger}
            aria-disabled={!!it.disabled}
            aria-haspopup={it.submenu ? "menu" : undefined}
            onPointerMove={() => onHover(depth, i)}
            onClick={() => onPick(depth, i)}
          >
            {hasCheck && <span className="sys-menu-check">{it.checked ? <LuCheck /> : null}</span>}
            {hasIcon && <span className="sys-menu-icon">{renderIcon(it.icon)}</span>}
            <span className="sys-menu-label">{it.label}</span>
            {it.shortcut ? <span className="sys-menu-shortcut">{it.shortcut}</span> : null}
            {it.submenu ? <LuChevronRight className="sys-menu-chev" /> : null}
          </div>
        )
      )}
    </div>
  );
});

/**
 * @param {object} props
 * @param {Array} props.items  [{ label, icon?, shortcut?, checked?, disabled?, danger?, onClick?, submenu? } | { separator: true }]
 * @param {"context"|"bar"} props.origin  context: flips around the pointer; bar: hangs below an anchor
 * @param {boolean} props.autoHighlight  highlight the first row (keyboard-opened menus)
 * @param {(dir:1|-1)=>void} props.onSide  ArrowLeft/Right at the root level (menu-bar switching)
 * @param {(target:Element)=>boolean} props.isInside  extra region that does not count as "outside"
 */
export default function Menu({
  items,
  x,
  y,
  origin = "context",
  autoHighlight = false,
  instant = false,
  resetKey,
  onClose,
  onSide,
  isInside,
}) {
  const [isPresent, safeToRemove] = usePresence();
  const rootRef = useRef(null);
  const list = useMemo(() => clean(items), [items]);
  const [path, setPathState] = useState(() => [autoHighlight ? firstUsable(list) : -1]);
  const pathRef = useRef(path);
  // A menu-bar dropdown reuses one Menu while switching titles: start fresh per title.
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    const fresh = [autoHighlight ? firstUsable(list) : -1];
    pathRef.current = fresh;
    setPathState(fresh);
  }
  const timer = useRef(0);
  const cb = useRef({ onClose, onSide, isInside });
  useLayoutEffect(() => {
    cb.current = { onClose, onSide, isInside };
  });

  const setPath = useCallback((next) => {
    if (same(pathRef.current, next)) return;
    pathRef.current = next;
    setPathState(next);
  }, []);

  // Exit: fade the panels with CSS, then let AnimatePresence unmount us.
  useEffect(() => {
    if (isPresent) return;
    const t = setTimeout(safeToRemove, FADE_MS);
    return () => clearTimeout(t);
  }, [isPresent, safeToRemove]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const hover = useCallback(
    (d, i) => {
      const p = pathRef.current;
      const it = levelsFor(list, p)[d]?.[i];
      const next = [...p.slice(0, d), usable(it) ? i : -1];
      if (usable(it) && subOf(it)) next.push(-1);
      clearTimeout(timer.current);
      // Leaving an open submenu's parent row: wait a beat so a diagonal move into the submenu survives.
      if (p.length > d + 1 && p[d] !== i) timer.current = setTimeout(() => setPath(next), 130);
      else setPath(next);
    },
    [list, setPath]
  );

  const leave = useCallback(
    (d) => {
      const p = pathRef.current;
      if (p.length === d + 1 && p[d] !== -1) setPath([...p.slice(0, d), -1]);
    },
    [setPath]
  );

  const pick = useCallback(
    (d, i) => {
      const p = pathRef.current;
      const it = levelsFor(list, p)[d]?.[i];
      if (!usable(it)) return;
      if (subOf(it) && !it.onClick) {
        clearTimeout(timer.current);
        setPath([...p.slice(0, d), i, -1]);
        return;
      }
      cb.current.onClose?.();
      try {
        it.onClick?.();
      } catch (err) {
        console.error("[menu] item handler failed", err);
      }
    },
    [list, setPath]
  );

  // Keyboard + outside interactions, only while this menu is the live one.
  useEffect(() => {
    if (!isPresent) return;
    const close = () => cb.current.onClose?.();

    const offKeys = onKeys((e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      const p = pathRef.current;
      const d = p.length - 1;
      const lv = levelsFor(list, p);
      const cur = lv[d] || [];
      const move = (dir, from) => {
        const n = cur.length;
        let i = from;
        for (let k = 0; k < n; k++) {
          i = (i + dir + n) % n;
          if (usable(cur[i])) return setPath([...p.slice(0, d), i]);
        }
      };
      switch (e.key) {
        case "Escape":
          if (d > 0) setPath(p.slice(0, -1));
          else close();
          return true;
        case "Tab":
          close();
          return true;
        case "ArrowDown":
          move(1, p[d]);
          return true;
        case "ArrowUp":
          move(-1, p[d] < 0 ? 0 : p[d]);
          return true;
        case "Home":
        case "PageUp":
          move(1, -1);
          return true;
        case "End":
        case "PageDown":
          move(-1, 0);
          return true;
        case "ArrowRight": {
          const it = cur[p[d]];
          const sub = usable(it) ? subOf(it) : null;
          if (sub) setPath([...p, firstUsable(sub)]);
          else cb.current.onSide?.(1);
          return true;
        }
        case "ArrowLeft":
          if (d > 0) setPath(p.slice(0, -1));
          else cb.current.onSide?.(-1);
          return true;
        case "Enter":
        case " ": {
          const it = cur[p[d]];
          if (!usable(it)) return true;
          const sub = subOf(it);
          if (sub && !it.onClick) setPath([...p, firstUsable(sub)]);
          else pick(d, p[d]);
          return true;
        }
        default:
          if (e.key.length === 1) {
            // type-ahead: jump to the next row starting with this character
            const ch = e.key.toLowerCase();
            const n = cur.length;
            for (let k = 1; k <= n; k++) {
              const i = (Math.max(p[d], -1) + k + n) % n;
              if (usable(cur[i]) && String(cur[i].label ?? "").toLowerCase().startsWith(ch)) {
                setPath([...p.slice(0, d), i]);
                break;
              }
            }
            return true;
          }
          return false;
      }
    }, 100);

    const outside = (e) => {
      const t = e.target;
      if (t instanceof Node && rootRef.current?.contains(t)) return;
      if (t instanceof Element && cb.current.isInside?.(t)) return;
      close();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("wheel", outside, { capture: true, passive: true });
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      offKeys();
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("wheel", outside, { capture: true });
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [isPresent, list, pick, setPath]);

  const levels = levelsFor(list, path);
  if (list.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="sys-menu-root"
      data-closing={!isPresent}
      data-instant={instant}
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {levels.map((lv, d) => (
        <Panel
          key={d === 0 ? "root" : `${d}:${path[d - 1]}`}
          items={lv}
          depth={d}
          active={path[d] ?? -1}
          parentIndex={d > 0 ? path[d - 1] : -1}
          x={x}
          y={y}
          origin={origin}
          onHover={hover}
          onLeave={leave}
          onPick={pick}
        />
      ))}
    </div>
  );
}
