// Launchpad: full-screen app grid with search and arrow-key navigation.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion as Motion, useIsPresent } from "framer-motion";
import { LuSearch } from "react-icons/lu";
import { getApp, launchpadApps } from "../../apps";
import { useSettings } from "../../settingsStore";
import { ui } from "../../ui";
import { wm } from "../../windowStore";

const allApps = () => {
  const finder = getApp("finder");
  const rest = launchpadApps().filter((a) => a.id !== "finder");
  return finder ? [finder, ...rest] : rest;
};

export default function Launchpad() {
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const present = useIsPresent();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(-1);
  const inputRef = useRef(null);
  const gridRef = useRef(null);

  const apps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allApps();
    if (!q) return list;
    return list
      .filter((a) => a.name.toLowerCase().includes(q) || a.id.includes(q))
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q))
      );
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (sel < 0) return;
    const grid = gridRef.current;
    const el = grid?.querySelector(`[data-index="${sel}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    // Keep DOM focus in step when the user is tabbing through the grid.
    if (grid.contains(document.activeElement) && document.activeElement !== el) el.focus();
  }, [sel]);

  const launch = (app) => {
    ui.setOverlay(null);
    wm.open(app.id);
  };

  const columns = () => {
    const grid = gridRef.current;
    if (!grid) return 1;
    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
  };

  const onKeyDown = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const n = apps.length;
    if (!n) return;
    const move = (delta) => {
      e.preventDefault();
      setSel((cur) => {
        if (cur < 0) return 0;
        const next = cur + delta;
        return next < 0 || next >= n ? cur : next;
      });
    };
    if (e.key === "ArrowDown") move(columns());
    else if (e.key === "ArrowUp") move(-columns());
    else if (e.key === "ArrowRight" && (sel >= 0 || !query)) move(1);
    else if (e.key === "ArrowLeft" && (sel >= 0 || !query)) move(-1);
    else if (e.key === "Home" && sel >= 0) {
      e.preventDefault();
      setSel(0);
    } else if (e.key === "End" && sel >= 0) {
      e.preventDefault();
      setSel(n - 1);
    } else if (e.key === "Enter" && e.target === inputRef.current) {
      const app = apps[sel >= 0 ? sel : query ? 0 : -1];
      if (app) {
        e.preventDefault();
        launch(app);
      }
    }
  };

  const active = sel >= 0 ? sel : query.trim() && apps.length ? 0 : -1;
  const fade = reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] };

  return (
    <Motion.div
      className="lp-root"
      role="dialog"
      aria-modal="true"
      aria-label="Launchpad"
      data-exiting={!present || undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (!e.target.closest("[data-lp-keep]")) ui.setOverlay(null);
      }}
    >
      <Motion.div
        className="lp-stage"
        initial={reduceMotion ? false : { scale: 1.12 }}
        animate={{ scale: 1 }}
        exit={reduceMotion ? undefined : { scale: 1.08 }}
        transition={fade}
      >
        <label className="lp-search" data-lp-keep>
          <LuSearch aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search"
            aria-label="Search apps"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(-1);
            }}
          />
        </label>

        <div className="lp-scroll os-scroll">
          {apps.length === 0 ? (
            <p className="lp-empty">No apps match “{query.trim()}”</p>
          ) : (
            <div className="lp-grid" ref={gridRef} role="list">
              {apps.map((app, i) => (
                <Motion.button
                  key={app.id}
                  type="button"
                  role="listitem"
                  className="lp-app"
                  data-lp-keep
                  data-index={i}
                  data-active={i === active || undefined}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.72 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, scale: 0.8 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 420,
                          damping: 30,
                          delay: present ? Math.min(i, 18) * 0.018 : 0,
                        }
                  }
                  onClick={() => launch(app)}
                  onFocus={() => setSel(i)}
                >
                  <img src={app.icon} alt="" draggable={false} decoding="async" />
                  <span>{app.name}</span>
                </Motion.button>
              ))}
            </div>
          )}
        </div>
      </Motion.div>
    </Motion.div>
  );
}
