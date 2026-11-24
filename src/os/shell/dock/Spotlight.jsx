// Spotlight: apps, files, system actions, a calculator and web search in one bar.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useIsPresent } from "framer-motion";
import {
  LuAppWindow,
  LuCalculator,
  LuCornerDownLeft,
  LuFile,
  LuFileCode,
  LuFileText,
  LuFilm,
  LuFolder,
  LuGlobe,
  LuImage,
  LuLayers,
  LuLayoutGrid,
  LuLink,
  LuLock,
  LuMoon,
  LuMusic,
  LuPanelBottom,
  LuRotateCcw,
  LuSearch,
  LuSquareX,
  LuTrash2,
} from "react-icons/lu";
import { APPS } from "../../apps";
import fs, { HOME, TRASH, dirname, tilde, useFs } from "../../fs";
import { openPath, openUrl } from "../../open";
import { DEFAULT_WALLPAPER, settings, useSettings } from "../../settingsStore";
import { notify, ui } from "../../ui";
import { wm } from "../../windowStore";
import { evaluate } from "./calc";

const KIND_ICON = {
  dir: LuFolder,
  image: LuImage,
  pdf: LuFileText,
  markdown: LuFileText,
  text: LuFileText,
  code: LuFileCode,
  audio: LuMusic,
  video: LuFilm,
  link: LuLink,
  app: LuAppWindow,
};

const KIND_LABEL = {
  dir: "Folder",
  image: "Image",
  pdf: "PDF Document",
  markdown: "Markdown",
  text: "Text",
  code: "Source Code",
  audio: "Audio",
  video: "Video",
  link: "Web Link",
  app: "Application",
};

function nextWallpaper() {
  const dir = dirname(DEFAULT_WALLPAPER);
  const images = fs.list(dir).filter((f) => f.type === "file" && f.kind === "image");
  if (!images.length) {
    notify({ title: "No wallpapers found", body: tilde(dir) });
    return;
  }
  const i = images.findIndex((f) => f.path === settings.wallpaper);
  const next = images[(i + 1) % images.length];
  settings.set({ wallpaper: next.path });
  notify({ title: "Wallpaper changed", body: next.name });
}

const ACTIONS = [
  {
    id: "theme",
    label: () => (settings.theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"),
    keywords: "toggle dark mode light appearance theme",
    icon: LuMoon,
    run: () => settings.set({ theme: settings.theme === "dark" ? "light" : "dark" }),
  },
  {
    id: "lock",
    label: () => "Lock Screen",
    keywords: "lock screen sleep logout",
    icon: LuLock,
    run: () => ui.setLocked(true),
  },
  {
    id: "wallpaper",
    label: () => "Change Wallpaper",
    keywords: "change wallpaper background desktop picture next",
    icon: LuImage,
    run: nextWallpaper,
  },
  {
    id: "trash",
    label: () => "Empty Trash",
    keywords: "empty trash delete bin",
    icon: LuTrash2,
    run: () => {
      const n = fs.list(TRASH, { hidden: true }).length;
      fs.emptyTrash();
      notify({ title: "Trash", body: n ? `Removed ${n} item${n === 1 ? "" : "s"}.` : "The Trash is already empty." });
    },
  },
  {
    id: "mission",
    label: () => "Mission Control",
    keywords: "mission control windows overview expose",
    icon: LuLayers,
    run: () => ui.setOverlay("missionControl"),
  },
  {
    id: "launchpad",
    label: () => "Launchpad",
    keywords: "launchpad apps applications grid",
    icon: LuLayoutGrid,
    run: () => ui.setOverlay("launchpad"),
  },
  {
    id: "dockhide",
    label: () => (settings.dockAutoHide ? "Turn Dock Hiding Off" : "Turn Dock Hiding On"),
    keywords: "dock hide autohide show toggle",
    icon: LuPanelBottom,
    run: () => settings.set({ dockAutoHide: !settings.dockAutoHide }),
  },
  {
    id: "closeall",
    label: () => "Close All Windows",
    keywords: "close all windows quit everything",
    icon: LuSquareX,
    run: () => wm.closeAll(),
  },
  {
    id: "restart",
    label: () => "Restart",
    keywords: "restart reboot boot shutdown power",
    icon: LuRotateCcw,
    run: () => {
      window.location.hash = "#/";
    },
  },
];

const looksLikeUrl = (q) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(q);

function buildGroups(query) {
  const raw = query.trim();
  const q = raw.toLowerCase();
  if (!q) return [];
  const groups = [];
  const rank = (name) => (name.toLowerCase().startsWith(q) ? 0 : 1);

  const calc = evaluate(raw);
  if (calc) {
    groups.push({
      title: "Calculator",
      items: [
        {
          key: "calc",
          Icon: LuCalculator,
          title: calc.text,
          subtitle: `${raw.replace(/=$/, "")} =`,
          hint: "Copy",
          run: () => {
            const text = String(calc.value);
            navigator.clipboard?.writeText(text).then(
              () => notify({ title: "Copied to clipboard", body: text }),
              () => notify({ title: "Result", body: text })
            );
          },
        },
      ],
    });
  }

  const apps = APPS.filter((a) => a.name.toLowerCase().includes(q) || a.id.includes(q))
    .sort((a, b) => rank(a.name) - rank(b.name))
    .slice(0, 6);
  if (apps.length) {
    groups.push({
      title: "Applications",
      items: apps.map((a) => ({
        key: `app:${a.id}`,
        img: a.icon,
        title: a.name,
        subtitle: "Application",
        hint: "Open",
        run: () => wm.open(a.id),
      })),
    });
  }

  const actions = ACTIONS.map((a) => ({ a, label: a.label() }))
    .filter(({ a, label }) => label.toLowerCase().includes(q) || a.keywords.includes(q))
    .sort((x, y) => rank(x.label) - rank(y.label))
    .slice(0, 5);
  if (actions.length) {
    groups.push({
      title: "Actions",
      items: actions.map(({ a, label }) => ({
        key: `action:${a.id}`,
        Icon: a.icon,
        title: label,
        subtitle: "System action",
        hint: "Run",
        run: a.run,
      })),
    });
  }

  const files = fs
    .search(q, HOME, 60)
    .filter((f) => f.path !== HOME && !f.path.slice(HOME.length).includes("/."))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length)
    .slice(0, 8);
  if (files.length) {
    groups.push({
      title: "Files",
      items: files.map((f) => {
        const kind = f.type === "dir" ? "dir" : f.kind;
        return {
          key: `file:${f.path}`,
          Icon: KIND_ICON[kind] || LuFile,
          thumb: kind === "image" ? fs.thumb(f.path) : null,
          title: f.name,
          subtitle: tilde(dirname(f.path)),
          hint: KIND_LABEL[kind] || "Document",
          run: () => openPath(f.path),
        };
      }),
    });
  }

  const web = [];
  if (looksLikeUrl(raw)) {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    web.push({
      key: "web:url",
      Icon: LuGlobe,
      title: `Open ${raw}`,
      subtitle: "Safari",
      hint: "Go",
      run: () => openUrl(url),
    });
  }
  web.push({
    key: "web:search",
    Icon: LuSearch,
    title: `Search the web for “${raw}”`,
    subtitle: "DuckDuckGo in Safari",
    hint: "Search",
    run: () => openUrl(`https://duckduckgo.com/?q=${encodeURIComponent(raw)}`),
  });
  groups.push({ title: "Web", items: web });

  return groups;
}

export default function Spotlight() {
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const present = useIsPresent();
  const fsVersion = useFs();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fsVersion invalidates file results
  const groups = useMemo(() => buildGroups(query), [query, fsVersion]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const active = Math.min(sel, flat.length - 1);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (item) => {
    if (!item) return;
    ui.setOverlay(null);
    item.run();
  };

  const onKeyDown = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const n = flat.length;
    if (e.key === "ArrowDown" && n) {
      e.preventDefault();
      setSel((active + 1) % n);
    } else if (e.key === "ArrowUp" && n) {
      e.preventDefault();
      setSel((active - 1 + n) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(flat[active]);
    } else if (e.key === "Tab") {
      // Keep focus in the field; the list is driven by the arrow keys.
      e.preventDefault();
    }
  };

  let index = -1;
  const fade = reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] };

  return (
    <motion.div
      className="sp-root"
      data-exiting={!present || undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) ui.setOverlay(null);
      }}
    >
      <motion.div
        className="sp-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight Search"
        initial={reduceMotion ? false : { scale: 0.96, y: -8 }}
        animate={{ scale: 1, y: 0 }}
        exit={reduceMotion ? undefined : { scale: 0.97 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 36 }}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          // Clicking results must not steal focus from the field.
          if (e.target !== inputRef.current) e.preventDefault();
        }}
      >
        <label className="sp-field">
          <LuSearch aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="sp-results"
            aria-activedescendant={flat.length ? `sp-item-${active}` : undefined}
            aria-label="Spotlight Search"
            placeholder="Spotlight Search"
            value={query}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
          />
          <kbd className="sp-kbd">esc</kbd>
        </label>

        {flat.length > 0 && (
          <>
            <div className="sp-results os-scroll" id="sp-results" role="listbox" ref={listRef}>
              {groups.map((g) => (
                <div key={g.title} role="group" aria-label={g.title}>
                  <div className="sp-group">{g.title}</div>
                  {g.items.map((item) => {
                    const i = ++index;
                    const { Icon } = item;
                    return (
                      <div
                        key={item.key}
                        id={`sp-item-${i}`}
                        role="option"
                        aria-selected={i === active}
                        className="sp-item"
                        data-index={i}
                        data-active={i === active || undefined}
                        onPointerMove={() => i !== active && setSel(i)}
                        onClick={() => run(item)}
                      >
                        <span className="sp-icon">
                          {item.img || item.thumb ? (
                            <img
                              src={item.img || item.thumb}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                              data-thumb={item.thumb ? "" : undefined}
                            />
                          ) : (
                            <Icon aria-hidden="true" />
                          )}
                        </span>
                        <span className="sp-text">
                          <span className="sp-title">{item.title}</span>
                          <span className="sp-sub">{item.subtitle}</span>
                        </span>
                        <span className="sp-hint">
                          {i === active ? (
                            <>
                              {item.hint} <LuCornerDownLeft aria-hidden="true" />
                            </>
                          ) : (
                            item.hint
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="sp-footer" aria-hidden="true">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> Navigate
              </span>
              <span>
                <kbd>↵</kbd> Open
              </span>
              <span>
                <kbd>esc</kbd> Close
              </span>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
