// Finder: the SherlockOS file browser, built on the virtual filesystem (src/os/fs.js).
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LuArrowDownUp,
  LuChevronLeft,
  LuChevronRight,
  LuCircleX,
  LuColumns3,
  LuFolderPlus,
  LuGalleryHorizontal,
  LuLayoutGrid,
  LuList,
  LuPanelLeft,
  LuSearch,
  LuSquareTerminal,
} from "react-icons/lu";
import fs, { useFs, HOME, TRASH, basename, dirname, join, normalize, formatSize } from "../../os/fs";
import { wm, useWindows } from "../../os/windowStore";
import { openPath, DEFAULT_APP } from "../../os/open";
import { contextMenu, notify } from "../../os/ui";
import { settings } from "../../os/settingsStore";
import { clipboard, useClipboard } from "./clipboard";
import { consumeDragClick, startItemDrag, startRubberBand } from "./drag";
import {
  SORTS,
  VIEWS,
  ancestors,
  columnBase,
  countLabel,
  displayName,
  folderInfo,
  inTrash,
  openWithApps,
  revealElement,
  sortItems,
} from "./util";
import FileIcon from "./FileIcon";
import Sidebar from "./Sidebar";
import { ColumnView, GalleryView, IconView, ListView } from "./views";
import { InfoPanel, QuickLook } from "./Panels";
import "./finder.css";

const VIEW_ICONS = { icons: LuLayoutGrid, list: LuList, columns: LuColumns3, gallery: LuGalleryHorizontal };
const NARROW = 560;
const PREFS_KEY = "sherlockos.finder.prefs";
const EMPTY_SET = new Set();

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function savePrefs(patch) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* storage unavailable: prefs stay per-window */
  }
}

/** Where to go for a requested path: folders open, files open their parent with the file selected. */
function resolveTarget(path, select) {
  const st = path ? fs.stat(path) : null;
  if (!st) return { dir: HOME, select: [] };
  if (st.type === "dir") {
    const sel = select && fs.exists(select) && dirname(normalize(select)) === st.path ? [normalize(select)] : [];
    return { dir: st.path, select: sel };
  }
  return { dir: dirname(st.path), select: [st.path] };
}

/** "notes.txt" -> "notes copy.txt" (unique-ified by fs.copy). */
function copyName(p) {
  const base = basename(p);
  const dot = fs.isFile(p) ? base.lastIndexOf(".") : -1;
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  return join(dirname(p), `${stem} copy${ext}`);
}

const isMod = (e) => e.ctrlKey || e.metaKey;

/** Open a dropdown (context menu) anchored under a toolbar button. */
function menuUnder(e, items) {
  const r = e.currentTarget.getBoundingClientRect();
  contextMenu({ preventDefault() {}, stopPropagation() {}, clientX: r.left, clientY: r.bottom + 4 }, items);
}

export default function Finder({ windowId, propsVersion, path, select: selectProp }) {
  const fsv = useFs();
  const clip = useClipboard();
  const active = useWindows((s) => s.activeId === windowId);
  const rootRef = useRef(null);
  const bodyRef = useRef(null);
  const searchRef = useRef(null);

  // ---- location & history --------------------------------------------------
  const [init] = useState(() => resolveTarget(path, selectProp));
  const [nav, setNav] = useState(() => ({ stack: [init.dir], index: 0 }));
  const cwd = nav.stack[nav.index];
  const [sel, setSel] = useState(() => ({ paths: init.select, anchor: init.select[0] ?? null, lead: init.select[0] ?? null }));
  const [renaming, setRenaming] = useState(null);
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("folder"); // "folder" | "all"
  const [ql, setQl] = useState(false);
  const [infoPath, setInfoPath] = useState(null);

  // ---- view prefs ------------------------------------------------------------
  const [prefs] = useState(loadPrefs);
  const [view, setViewState] = useState(() => (VIEWS.some((v) => v.id === prefs.view) ? prefs.view : "icons"));
  const [sort, setSortState] = useState(() => prefs.sort || { key: "name", dir: "asc" });
  const [iconSize, setIconSizeState] = useState(() => prefs.iconSize || 64);
  const [narrow, setNarrow] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [sidebarOverlay, setSidebarOverlay] = useState(false);

  const setView = useCallback((v) => {
    setViewState(v);
    savePrefs({ view: v });
  }, []);
  const setSort = useCallback((s) => {
    setSortState(s);
    savePrefs({ sort: s });
  }, []);
  const setIconSize = (n) => {
    setIconSizeState(n);
    savePrefs({ iconSize: n });
  };
  const sortBy = useCallback(
    (key) => {
      if (sort.key === key) setSort({ key, dir: sort.dir === "asc" ? "desc" : "asc" });
      else setSort({ key, dir: key === "date" || key === "size" ? "desc" : "asc" });
    },
    [sort, setSort]
  );

  const focusRoot = useCallback(() => rootRef.current?.focus({ preventScroll: true }), []);
  const revealRef = useRef(false);

  const navigate = useCallback((dir, { select: selPaths = [], replace = false } = {}) => {
    setNav((n) => {
      if (n.stack[n.index] === dir) return n;
      if (replace) {
        const stack = [...n.stack];
        stack[n.index] = dir;
        return { stack, index: n.index };
      }
      const stack = [...n.stack.slice(0, n.index + 1), dir].slice(-60);
      return { stack, index: stack.length - 1 };
    });
    setSel({ paths: selPaths, anchor: selPaths[0] ?? null, lead: selPaths[selPaths.length - 1] ?? null });
    revealRef.current = selPaths.length > 0;
    setQuery("");
    setQ("");
    setRenaming(null);
    setSidebarOverlay(false);
  }, []);

  const goHistory = (delta) => {
    const index = nav.index + delta;
    if (index < 0 || index >= nav.stack.length) return;
    const from = nav.stack[nav.index];
    const to = nav.stack[index];
    setNav({ ...nav, index });
    const selPaths = dirname(from) === to && fs.exists(from) ? [from] : [];
    setSel({ paths: selPaths, anchor: selPaths[0] ?? null, lead: selPaths[0] ?? null });
    revealRef.current = true;
    setQuery("");
    setQ("");
    setRenaming(null);
  };

  // react to wm.open("finder", { path }) on an already-open window
  const firstProps = useRef(true);
  useEffect(() => {
    if (firstProps.current) {
      firstProps.current = false;
      return;
    }
    const t = resolveTarget(path, selectProp);
    navigate(t.dir, { select: t.select });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsVersion]);

  // the folder we are in was moved/trashed/deleted elsewhere: climb to what still exists
  useEffect(() => {
    if (fs.isDir(cwd)) return;
    let p = cwd;
    while (p !== "/" && !fs.isDir(p)) p = dirname(p);
    navigate(p, { replace: true });
  }, [cwd, fsv, navigate]);

  // debounced search
  useEffect(() => {
    const t = setTimeout(() => setQ(query), query ? 160 : 0);
    return () => clearTimeout(t);
  }, [query]);
  const searching = q.trim().length > 0;
  const searchRoot = scope === "all" ? "/" : cwd;

  // ---- items -----------------------------------------------------------------
  const items = useMemo(() => {
    void fsv;
    const raw = searching
      ? fs.search(q, searchRoot, 400).filter((i) => !i.name.startsWith(".") && i.path !== searchRoot)
      : fs.list(cwd, { hidden: cwd === TRASH });
    return sortItems(raw, sort);
  }, [cwd, q, searching, searchRoot, sort, fsv]);
  const itemPaths = useMemo(() => new Set(items.map((i) => i.path)), [items]);
  const selected = useMemo(() => sel.paths.filter((p) => itemPaths.has(p)), [sel.paths, itemPaths]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const lead = sel.lead && selectedSet.has(sel.lead) ? sel.lead : selected[selected.length - 1] ?? null;
  const leadItem = useMemo(() => (lead ? items.find((i) => i.path === lead) || null : null), [lead, items]);
  const selItems = useMemo(() => items.filter((i) => selectedSet.has(i.path)), [items, selectedSet]);
  const cutSet = useMemo(() => (clip.mode === "cut" && clip.paths.length ? new Set(clip.paths) : EMPTY_SET), [clip]);

  const trashView = inTrash(cwd);
  const effView = searching && view === "columns" ? "list" : view;
  const title = searching ? `Searching “${q.trim()}”` : displayName(cwd);

  const select = useCallback((paths) => {
    setSel({ paths, anchor: paths[0] ?? null, lead: paths[paths.length - 1] ?? null });
  }, []);

  useEffect(() => {
    wm.setTitle(windowId, title);
  }, [windowId, title]);

  // gallery always shows something
  useEffect(() => {
    if (effView === "gallery" && !lead && items.length) select([items[0].path]);
  }, [effView, lead, items, select]);

  // quick look follows the selection; closes when there's nothing to show
  useEffect(() => {
    if (ql && !leadItem) setQl(false);
  }, [ql, leadItem]);

  // keyboard navigation scrolls the lead item into view
  useLayoutEffect(() => {
    if (!revealRef.current || !lead) return;
    revealRef.current = false;
    const el = bodyRef.current?.querySelector(`[data-path="${CSS.escape(lead)}"]`);
    if (el) revealElement(el);
  }, [lead, effView, items]);

  // responsive sidebar
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setNarrow(el.getBoundingClientRect().width < NARROW);
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < NARROW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sidebarDocked = !narrow && !sidebarHidden;
  const sidebarShown = sidebarDocked || (narrow && sidebarOverlay);
  const toggleSidebar = () => (narrow ? setSidebarOverlay((v) => !v) : setSidebarHidden((v) => !v));

  // take keyboard focus when the window is activated from outside (dock, switcher, open)
  useEffect(() => {
    const el = rootRef.current;
    if (active && el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [active]);

  // ---- actions -----------------------------------------------------------------
  const openItems = (list) => {
    const dirs = list.filter((i) => i.type === "dir");
    list.filter((i) => i.type !== "dir").forEach((i) => openPath(i.path));
    if (dirs.length) navigate(dirs[0].path);
  };

  const openTerminal = (dir) => wm.open("terminal", { cwd: dir });

  const newFolder = (dir = cwd) => {
    if (inTrash(dir)) return;
    const p = fs.mkdir(join(dir, "untitled folder"), { unique: true });
    if (searching) {
      setQuery("");
      setQ("");
    }
    select([p]);
    revealRef.current = true;
    setRenaming(p);
  };

  const newTextFile = (dir = cwd) => {
    if (inTrash(dir)) return;
    const p = fs.createFile(dir, "untitled.txt", "");
    if (searching) {
      setQuery("");
      setQ("");
    }
    select([p]);
    revealRef.current = true;
    setRenaming(p);
  };

  const paste = (dir = cwd) => {
    const { paths, mode } = clipboard.get();
    if (!paths.length || inTrash(dir)) return;
    const out = [];
    for (const p of paths) {
      if (!fs.exists(p)) continue;
      let r = null;
      if (mode === "cut") r = dirname(p) === dir ? p : fs.move(p, join(dir, basename(p)));
      else r = fs.copy(p, dirname(p) === dir ? copyName(p) : join(dir, basename(p)));
      if (r) out.push(r);
    }
    if (mode === "cut") clipboard.clear();
    if (!out.length) {
      notify({ title: "Can't paste", body: "The items can't be placed in this folder." });
      return;
    }
    if (dir === cwd) {
      select(out);
      revealRef.current = true;
    }
  };

  const duplicate = (paths) => {
    const out = paths.map((p) => fs.copy(p, copyName(p))).filter(Boolean);
    if (out.length) {
      select(out);
      revealRef.current = true;
    }
  };

  const trashPaths = (paths) => {
    let failed = 0;
    for (const p of paths) if (!fs.trash(p)) failed++;
    if (failed) {
      notify({
        title: "Can't move to Trash",
        body:
          paths.length === 1
            ? `“${basename(paths[0])}” is a system folder and can't be moved.`
            : `${failed} of ${paths.length} items are system folders and stayed put.`,
      });
    }
    select([]);
  };

  const putBack = (paths) => {
    paths.forEach((p) => fs.restore(p));
    select([]);
  };
  const deleteNow = (paths) => {
    paths.forEach((p) => fs.remove(p));
    select([]);
  };
  const emptyTrash = () => {
    fs.emptyTrash();
    select([]);
  };

  const copyPath = (paths) => {
    navigator.clipboard?.writeText(paths.join("\n")).catch(() => {
      /* clipboard permission denied */
    });
  };

  const setWallpaper = (item) => {
    settings.set({ wallpaper: item.path });
    notify({ title: "Desktop picture changed", body: item.name, appId: "finder" });
  };

  const startRename = (p) => {
    if (!p || p === "/" || p === TRASH) return;
    select([p]);
    setRenaming(p);
  };

  const onRenameCommit = (p, value, viaKey) => {
    setRenaming(null);
    if (viaKey) focusRoot();
    const name = value.trim();
    const cur = basename(p);
    if (!name || name === cur) return;
    if (name.includes("/")) {
      notify({ title: "Invalid name", body: "Names can't contain “/”." });
      return;
    }
    const target = join(dirname(p), name);
    if (fs.exists(target) && target !== p) {
      notify({ title: "Name already taken", body: `“${name}” already exists here. Choose a different name.` });
      return;
    }
    const res = fs.rename(p, name);
    if (!res) {
      notify({ title: "Can't rename", body: `“${cur}” is a system folder and can't be renamed.` });
      return;
    }
    select([res]);
    revealRef.current = true;
  };

  // ---- menus ---------------------------------------------------------------------
  const sortMenuItems = () => [
    ...SORTS.map((s) => ({ label: s.label, checked: sort.key === s.id, onClick: () => setSort({ ...sort, key: s.id }) })),
    { separator: true },
    { label: "Ascending", checked: sort.dir === "asc", onClick: () => setSort({ ...sort, dir: "asc" }) },
    { label: "Descending", checked: sort.dir === "desc", onClick: () => setSort({ ...sort, dir: "desc" }) },
  ];
  const viewMenuItems = () =>
    VIEWS.map((v, i) => ({
      label: v.label,
      checked: view === v.id,
      shortcut: `Ctrl+${i + 1}`,
      onClick: () => setView(v.id),
    }));

  const itemMenu = (targets) => {
    const one = targets.length === 1 ? targets[0] : null;
    const n = targets.length;
    const paths = targets.map((t) => t.path);
    const many = (verb) => (n > 1 ? `${verb} ${n} Items` : verb);
    if (targets.every((t) => inTrash(t.path))) {
      return [
        { label: "Put Back", disabled: !targets.some((t) => t.trashedFrom), onClick: () => putBack(paths) },
        { label: "Delete Immediately", danger: true, onClick: () => deleteNow(paths) },
        { separator: true },
        one && { label: "Quick Look", shortcut: "Space", onClick: () => setQl(true) },
        one && { label: "Get Info", shortcut: "Ctrl+I", onClick: () => setInfoPath(one.path) },
        { label: "Copy Path", onClick: () => copyPath(paths) },
      ];
    }
    const apps = one ? openWithApps(one) : [];
    const def = !one || one.kind === "link" || one.kind === "app" ? null : DEFAULT_APP[one.kind] || "textedit";
    return [
      { label: "Open", shortcut: "Ctrl+↓", onClick: () => openItems(targets) },
      apps.length
        ? {
            label: "Open With",
            submenu: apps.map((a) => ({
              label: a.id === def ? `${a.name} (default)` : a.name,
              onClick: () => openPath(one.path, { app: a.id }),
            })),
          }
        : null,
      one?.type === "dir" ? { label: "Open in New Window", onClick: () => wm.open("finder", { path: one.path }) } : null,
      searching && one
        ? { label: "Show in Enclosing Folder", onClick: () => navigate(dirname(one.path), { select: [one.path] }) }
        : null,
      { separator: true },
      { label: "Move to Trash", shortcut: "Delete", onClick: () => trashPaths(paths) },
      { separator: true },
      one && { label: "Get Info", shortcut: "Ctrl+I", onClick: () => setInfoPath(one.path) },
      one && { label: "Rename", shortcut: "Enter", onClick: () => startRename(one.path) },
      { label: many("Duplicate"), shortcut: "Ctrl+D", onClick: () => duplicate(paths) },
      one && { label: "Quick Look", shortcut: "Space", onClick: () => setQl(true) },
      { separator: true },
      { label: many("Copy"), shortcut: "Ctrl+C", onClick: () => clipboard.set(paths, "copy") },
      { label: many("Cut"), shortcut: "Ctrl+X", onClick: () => clipboard.set(paths, "cut") },
      { label: n > 1 ? "Copy Paths" : "Copy Path", onClick: () => copyPath(paths) },
      one?.kind === "image" ? { separator: true } : null,
      one?.kind === "image" ? { label: "Set Desktop Picture", onClick: () => setWallpaper(one) } : null,
      one?.type === "dir" ? { separator: true } : null,
      one?.type === "dir" ? { label: "Open in Terminal", onClick: () => openTerminal(one.path) } : null,
    ];
  };

  const backgroundMenu = (e, dir = cwd) => {
    if (e.target.closest?.("[data-path]") && dir === cwd) return;
    if (dir !== cwd) navigate(dir);
    else select([]);
    const c = clipboard.get();
    const items =
      dir === TRASH || inTrash(dir)
        ? [
            {
              label: "Empty Trash",
              danger: true,
              disabled: !fs.list(TRASH, { hidden: true }).length,
              onClick: emptyTrash,
            },
            { separator: true },
            { label: "Sort By", submenu: sortMenuItems() },
            { label: "View", submenu: viewMenuItems() },
            { separator: true },
            { label: "Get Info", shortcut: "Ctrl+I", onClick: () => setInfoPath(dir) },
          ]
        : [
            { label: "New Folder", shortcut: "Ctrl+Shift+N", onClick: () => newFolder(dir) },
            { label: "New Text File", onClick: () => newTextFile(dir) },
            { separator: true },
            {
              label: c.paths.length > 1 ? `Paste ${c.paths.length} Items` : "Paste Item",
              shortcut: "Ctrl+V",
              disabled: !c.paths.length,
              onClick: () => paste(dir),
            },
            { separator: true },
            { label: "Sort By", submenu: sortMenuItems() },
            { label: "View", submenu: viewMenuItems() },
            { separator: true },
            { label: "Open in Terminal", onClick: () => openTerminal(dir) },
            { label: "Get Info", shortcut: "Ctrl+I", onClick: () => setInfoPath(dir) },
          ];
    contextMenu(e, items);
  };

  const sidebarMenu = (e, p) => {
    const items =
      p === TRASH
        ? [
            { label: "Open", onClick: () => navigate(p) },
            { separator: true },
            {
              label: "Empty Trash",
              danger: true,
              disabled: !fs.list(TRASH, { hidden: true }).length,
              onClick: emptyTrash,
            },
          ]
        : [
            { label: "Open", onClick: () => navigate(p) },
            { label: "Open in New Window", onClick: () => wm.open("finder", { path: p }) },
            { separator: true },
            { label: "Open in Terminal", onClick: () => openTerminal(p) },
            { label: "Get Info", onClick: () => setInfoPath(p) },
            { label: "Copy Path", onClick: () => copyPath([p]) },
          ];
    contextMenu(e, items);
  };

  // ---- pointer handling -----------------------------------------------------------
  const pendingSingle = useRef(null);
  const pointerType = useRef("mouse");

  const onItemPointerDown = (e, item) => {
    pointerType.current = e.pointerType || "mouse";
    if (e.button !== 0) return;
    e.stopPropagation();
    focusRoot();
    if (renaming === item.path) return;
    pendingSingle.current = null;
    // column view: clicking inside another column makes it the current folder
    if (!itemPaths.has(item.path)) {
      navigate(dirname(item.path), { select: [item.path] });
      if (e.pointerType !== "touch") startItemDrag(e, [item.path]);
      return;
    }
    let next;
    if (e.shiftKey && sel.anchor && itemPaths.has(sel.anchor)) {
      const a = items.findIndex((i) => i.path === sel.anchor);
      const b = items.findIndex((i) => i.path === item.path);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      next = items.slice(lo, hi + 1).map((i) => i.path);
      setSel({ paths: next, anchor: sel.anchor, lead: item.path });
    } else if (isMod(e)) {
      next = selectedSet.has(item.path) ? selected.filter((p) => p !== item.path) : [...selected, item.path];
      setSel({ paths: next, anchor: item.path, lead: item.path });
    } else if (!selectedSet.has(item.path)) {
      next = [item.path];
      setSel({ paths: next, anchor: item.path, lead: item.path });
    } else {
      next = selected;
      pendingSingle.current = item.path; // collapse to this item on click (if it wasn't a drag)
      setSel((s) => ({ ...s, lead: item.path }));
    }
    if (e.pointerType !== "touch" && next.includes(item.path) && renaming === null) {
      startItemDrag(e, items.filter((i) => next.includes(i.path)).map((i) => i.path));
    }
  };

  const onItemClick = (e, item) => {
    if (consumeDragClick()) {
      pendingSingle.current = null;
      return;
    }
    if (pointerType.current === "touch" && !isMod(e) && !e.shiftKey) {
      openItems([item]);
      return;
    }
    if (pendingSingle.current === item.path && !isMod(e) && !e.shiftKey) select([item.path]);
    pendingSingle.current = null;
  };

  const onItemDoubleClick = (e, item) => {
    if (isMod(e) || e.shiftKey || pointerType.current === "touch") return;
    openItems([item]);
  };

  const onItemContextMenu = (e, item) => {
    focusRoot();
    let targets;
    if (!itemPaths.has(item.path)) {
      navigate(dirname(item.path), { select: [item.path] });
      targets = [item];
    } else if (selectedSet.has(item.path)) targets = selItems;
    else {
      select([item.path]);
      targets = [item];
    }
    contextMenu(e, itemMenu(targets));
  };

  const onBackgroundPointerDown = (e) => {
    pointerType.current = e.pointerType || "mouse";
    if (e.button !== 0 || e.target.closest("[data-path]")) return;
    const el = e.currentTarget;
    // ignore presses on the scrollbar
    if (e.target === el && (e.nativeEvent.offsetX > el.clientWidth || e.nativeEvent.offsetY > el.clientHeight)) return;
    const additive = isMod(e) || e.shiftKey;
    const base = additive ? selected : [];
    if (!additive) select([]);
    if (e.pointerType === "touch" || !el.hasAttribute("data-rubber")) return;
    const order = items;
    startRubberBand(e, el, (hit) => {
      const set = new Set([...base, ...hit]);
      select(order.filter((i) => set.has(i.path)).map((i) => i.path));
    });
  };

  const onColumnBackground = (e, dir) => {
    focusRoot();
    if (dir !== cwd) navigate(dir);
    else select([]);
  };

  // stable handler object for memoized rows/cells (always calls the latest closures)
  const H = useRef(null);
  H.current = {
    onItemPointerDown,
    onItemClick,
    onItemDoubleClick,
    onItemContextMenu,
    onBackgroundPointerDown,
    backgroundMenu,
    onColumnBackground,
    onRenameCommit,
    openItems,
    cancelRename: (viaKey) => {
      setRenaming(null);
      if (viaKey) focusRoot();
    },
  };
  const h = useMemo(
    () => ({
      pointerDown: (e, i) => H.current.onItemPointerDown(e, i),
      click: (e, i) => H.current.onItemClick(e, i),
      doubleClick: (e, i) => H.current.onItemDoubleClick(e, i),
      contextMenu: (e, i) => H.current.onItemContextMenu(e, i),
      backgroundPointerDown: (e) => H.current.onBackgroundPointerDown(e),
      backgroundMenu: (e, dir) => H.current.backgroundMenu(e, typeof dir === "string" ? dir : undefined),
      columnBackground: (e, dir) => H.current.onColumnBackground(e, dir),
      renameCommit: (p, v, k) => H.current.onRenameCommit(p, v, k),
      renameCancel: (k) => H.current.cancelRename(k),
      open: (i) => H.current.openItems([i]),
    }),
    []
  );

  // ---- keyboard -----------------------------------------------------------------------
  const typeAhead = useRef({ buf: "", t: 0 });

  const gridColumns = () => {
    const cells = bodyRef.current?.querySelectorAll(".finder-cell");
    if (!cells?.length) return 1;
    const top = cells[0].offsetTop;
    let n = 0;
    for (const c of cells) {
      if (c.offsetTop !== top) break;
      n++;
    }
    return Math.max(1, n);
  };

  const selectIndex = (idx, extend) => {
    const p = items[idx].path;
    revealRef.current = true;
    if (extend && sel.anchor && itemPaths.has(sel.anchor)) {
      const a = items.findIndex((i) => i.path === sel.anchor);
      const [lo, hi] = a < idx ? [a, idx] : [idx, a];
      setSel({ paths: items.slice(lo, hi + 1).map((i) => i.path), anchor: sel.anchor, lead: p });
    } else setSel({ paths: [p], anchor: p, lead: p });
  };

  const moveSelection = (key, extend) => {
    if (effView === "columns") {
      if (key === "ArrowRight") {
        if (leadItem?.type === "dir") {
          const kids = sortItems(fs.list(leadItem.path), sort);
          navigate(leadItem.path, { select: kids[0] ? [kids[0].path] : [] });
        }
        return;
      }
      if (key === "ArrowLeft") {
        if (cwd !== columnBase(cwd)) navigate(dirname(cwd), { select: [cwd] });
        return;
      }
    }
    const n = items.length;
    if (!n) return;
    let delta;
    if (effView === "icons") {
      const cols = gridColumns();
      delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[key];
    } else if (effView === "gallery") {
      delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[key];
    } else {
      delta = { ArrowUp: -1, ArrowDown: 1 }[key];
    }
    if (!delta) return;
    const idx = lead ? items.findIndex((i) => i.path === lead) : -1;
    let next = idx < 0 ? (delta > 0 ? 0 : n - 1) : idx + delta;
    if (next < 0 || next >= n) {
      if (Math.abs(delta) === 1) return;
      next = Math.max(0, Math.min(n - 1, next));
      if (next === idx) return;
    }
    selectIndex(next, extend);
  };

  const onKeyDown = (e) => {
    const t = e.target;
    if (t.closest("input, textarea, [contenteditable='true']")) return;
    const k = e.key;
    // keyboard-focused controls keep their own Enter/Space activation
    if ((k === "Enter" || k === " ") && t !== rootRef.current && t.closest("button, a, [role='menuitem']")) return;
    const done = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (isMod(e) && !e.altKey) {
      const lk = k.length === 1 ? k.toLowerCase() : k;
      if (lk === "a") select(items.map((i) => i.path));
      else if (lk === "c" && selected.length) clipboard.set(selected, "copy");
      else if (lk === "x" && selected.length && !trashView) clipboard.set(selected, "cut");
      else if (lk === "v") paste();
      else if (lk === "d" && selected.length && !trashView) duplicate(selected);
      else if (lk === "i") setInfoPath(lead || cwd);
      else if (lk === "f") searchRef.current?.focus();
      else if (lk === "n" && e.shiftKey) newFolder();
      else if (k === "ArrowDown" && selItems.length) openItems(selItems);
      else if (k === "ArrowUp") {
        if (cwd !== "/") navigate(dirname(cwd), { select: [cwd] });
      } else if (k === "[") goHistory(-1);
      else if (k === "]") goHistory(1);
      else if ((k === "Backspace" || k === "Delete") && selected.length && !trashView) trashPaths(selected);
      else if (/^[1-4]$/.test(k)) setView(VIEWS[Number(k) - 1].id);
      else return;
      done();
      return;
    }
    if (e.altKey) return;

    switch (k) {
      case "Enter":
        if (selected.length === 1) startRename(selected[0]);
        done();
        return;
      case " ":
        if (ql) setQl(false);
        else if (leadItem) setQl(true);
        done();
        return;
      case "Escape":
        if (ql) setQl(false);
        else if (infoPath) setInfoPath(null);
        else if (sidebarOverlay) setSidebarOverlay(false);
        else if (query) {
          setQuery("");
          setQ("");
        } else if (selected.length) select([]);
        else return;
        done();
        return;
      case "Backspace":
      case "Delete":
        if (selected.length && !trashView) trashPaths(selected);
        done();
        return;
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight":
        moveSelection(k, e.shiftKey);
        done();
        return;
      case "Home":
      case "End":
        if (items.length) selectIndex(k === "Home" ? 0 : items.length - 1, e.shiftKey);
        done();
        return;
      default:
        if (k.length === 1 && /\S/.test(k)) {
          const now = Date.now();
          const ta = typeAhead.current;
          ta.buf = now - ta.t > 900 ? k : ta.buf + k;
          ta.t = now;
          const needle = ta.buf.toLowerCase();
          const idx = items.findIndex((i) => i.name.toLowerCase().startsWith(needle));
          if (idx >= 0) selectIndex(idx, false);
          done();
        }
    }
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setQuery("");
      setQ("");
      focusRoot();
    } else if ((e.key === "ArrowDown" || e.key === "Enter") && items.length) {
      e.preventDefault();
      setQ(query);
      focusRoot();
      if (!lead) selectIndex(0, false);
    }
  };

  // ---- derived display -------------------------------------------------------------------
  const statusText = useMemo(() => {
    void fsv;
    let size = 0;
    let any = false;
    const list = selItems.length ? selItems : items;
    for (const i of list) {
      if (i.type === "dir") {
        if (selItems.length) {
          size += folderInfo(i.path).size;
          any = true;
        }
      } else {
        size += i.size || 0;
        any = true;
      }
    }
    let s = searching ? (items.length === 1 ? "1 result" : `${items.length} results`) : countLabel(items.length);
    if (selItems.length) s += `, ${selItems.length} selected`;
    if (any && size) s += ` · ${formatSize(size)}`;
    return s;
  }, [items, selItems, searching, fsv]);

  const single = selItems.length === 1 ? selItems[0] : null;
  const emptyText = searching
    ? `No results for “${q.trim()}”`
    : cwd === TRASH
    ? "Trash is empty"
    : "This folder is empty";
  const dropDir = searching ? null : cwd;

  const pathBase = searching && leadItem ? dirname(leadItem.path) : cwd;
  const crumbs = useMemo(() => {
    const all = ancestors(pathBase);
    return inTrash(pathBase) ? all.filter((p) => inTrash(p)) : all;
  }, [pathBase]);
  const leafItem = leadItem && dirname(leadItem.path) === pathBase ? leadItem : null;

  const infoItem = infoPath ? fs.stat(infoPath) : null;
  const ViewIcon = VIEW_ICONS[view];

  let body;
  if (effView === "list")
    body = (
      <ListView
        items={items}
        selectedSet={selectedSet}
        renaming={renaming}
        cutSet={cutSet}
        searching={searching}
        sort={sort}
        onSort={sortBy}
        dropDir={dropDir}
        empty={emptyText}
        h={h}
      />
    );
  else if (effView === "columns")
    body = (
      <ColumnView
        cwd={cwd}
        items={items}
        sort={sort}
        selectedSet={selectedSet}
        single={single}
        renaming={renaming}
        cutSet={cutSet}
        fsv={fsv}
        h={h}
      />
    );
  else if (effView === "gallery")
    body = (
      <GalleryView
        items={items}
        selectedSet={selectedSet}
        leadItem={leadItem}
        renaming={renaming}
        cutSet={cutSet}
        dropDir={dropDir}
        empty={emptyText}
        fsv={fsv}
        h={h}
      />
    );
  else
    body = (
      <IconView
        items={items}
        selectedSet={selectedSet}
        renaming={renaming}
        cutSet={cutSet}
        iconSize={iconSize}
        searching={searching}
        dropDir={dropDir}
        empty={emptyText}
        h={h}
      />
    );

  return (
    <div
      ref={rootRef}
      className={`finder${active ? "" : " finder--inactive"}${narrow ? " finder--narrow" : ""}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (!e.target.closest("input, textarea")) focusRoot();
      }}
      onMouseDown={(e) => {
        // like macOS: clicking a toolbar button doesn't steal keyboard focus from the file view
        if (e.target.closest("button")) e.preventDefault();
      }}
    >
      {sidebarShown ? (
        <Sidebar cwd={cwd} fsv={fsv} overlay={narrow} onNavigate={(p) => navigate(p)} onMenu={sidebarMenu} />
      ) : null}
      {narrow && sidebarOverlay ? (
        <div className="finder-sidebar-scrim" onPointerDown={() => setSidebarOverlay(false)} />
      ) : null}

      <div className="finder-main">
        <div className={`os-toolbar finder-toolbar${sidebarDocked ? " finder-toolbar--docked" : ""}`} data-window-drag>
          <button
            type="button"
            className="os-icon-btn"
            title={sidebarShown ? "Hide Sidebar" : "Show Sidebar"}
            aria-label="Toggle sidebar"
            aria-pressed={sidebarShown}
            onClick={toggleSidebar}
          >
            <LuPanelLeft />
          </button>
          <div className="finder-nav">
            <button
              type="button"
              className="os-icon-btn"
              title="Back"
              aria-label="Back"
              disabled={nav.index === 0}
              onClick={() => goHistory(-1)}
            >
              <LuChevronLeft />
            </button>
            <button
              type="button"
              className="os-icon-btn"
              title="Forward"
              aria-label="Forward"
              disabled={nav.index >= nav.stack.length - 1}
              onClick={() => goHistory(1)}
            >
              <LuChevronRight />
            </button>
          </div>
          <div className="os-toolbar-title finder-title" title={title}>
            {title}
          </div>
          <div className="os-toolbar-spacer" />
          <div className="finder-seg" role="group" aria-label="View">
            {VIEWS.map((v) => {
              const Icon = VIEW_ICONS[v.id];
              return (
                <button
                  key={v.id}
                  type="button"
                  className="finder-seg-btn"
                  title={`View ${v.label}`}
                  aria-label={`View ${v.label}`}
                  aria-pressed={view === v.id}
                  onClick={() => setView(v.id)}
                >
                  <Icon />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="os-icon-btn finder-view-menu"
            title="View"
            aria-label="Change view"
            onClick={(e) => menuUnder(e, viewMenuItems())}
          >
            <ViewIcon />
          </button>
          <button
            type="button"
            className="os-icon-btn finder-tb-sort"
            title="Sort By"
            aria-label="Sort by"
            onClick={(e) => menuUnder(e, sortMenuItems())}
          >
            <LuArrowDownUp />
          </button>
          <button
            type="button"
            className="os-icon-btn finder-tb-wide"
            title="New Folder"
            aria-label="New folder"
            disabled={trashView}
            onClick={() => newFolder()}
          >
            <LuFolderPlus />
          </button>
          <button
            type="button"
            className="os-icon-btn finder-tb-wide"
            title="Open in Terminal"
            aria-label="Open in Terminal"
            onClick={() => openTerminal(cwd)}
          >
            <LuSquareTerminal />
          </button>
          <label className="finder-search" data-no-drag>
            <LuSearch aria-hidden="true" />
            <input
              ref={searchRef}
              className="finder-search-input"
              type="search"
              placeholder="Search"
              aria-label="Search"
              value={query}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
            {query ? (
              <button
                type="button"
                className="finder-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setQ("");
                  searchRef.current?.focus();
                }}
              >
                <LuCircleX />
              </button>
            ) : null}
          </label>
        </div>

        {searching ? (
          <div className="finder-scope">
            <span className="finder-scope-label">Search:</span>
            <button
              type="button"
              className="finder-scope-btn"
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              SherlockOS
            </button>
            {cwd !== "/" ? (
              <button
                type="button"
                className="finder-scope-btn"
                aria-pressed={scope === "folder"}
                onClick={() => setScope("folder")}
              >
                “{displayName(cwd)}”
              </button>
            ) : null}
          </div>
        ) : null}
        {cwd === TRASH && !searching ? (
          <div className="finder-banner">
            <span>Items in the Trash can be put back or deleted permanently.</span>
            <button type="button" className="os-btn" disabled={!items.length} onClick={emptyTrash}>
              Empty
            </button>
          </div>
        ) : null}

        <div className="finder-body" ref={bodyRef}>
          {body}
        </div>

        <div className="finder-pathbar" aria-label="Path">
          {crumbs.map((p, i) => (
            <Fragment key={p}>
              {i > 0 ? <LuChevronRight className="finder-crumb-sep" aria-hidden="true" /> : null}
              <button
                type="button"
                className="finder-crumb"
                data-finder-drop={p}
                data-no-drag
                title={p}
                onClick={() => navigate(p)}
              >
                <FileIcon item={{ path: p, type: "dir" }} size={14} detail={false} />
                <span>{displayName(p)}</span>
              </button>
            </Fragment>
          ))}
          {leafItem ? (
            <>
              <LuChevronRight className="finder-crumb-sep" aria-hidden="true" />
              <span className="finder-crumb finder-crumb--leaf">
                <FileIcon item={leafItem} size={14} detail={false} />
                <span>{leafItem.name}</span>
              </span>
            </>
          ) : null}
        </div>
        <div className="finder-status">
          <span className="finder-status-text">{statusText}</span>
          {effView === "icons" ? (
            <input
              className="finder-zoom"
              type="range"
              min={32}
              max={128}
              step={4}
              value={iconSize}
              aria-label="Icon size"
              data-no-drag
              onChange={(e) => setIconSize(Number(e.target.value))}
            />
          ) : null}
        </div>
      </div>

      {ql && leadItem ? (
        <QuickLook item={leadItem} fsv={fsv} onClose={() => setQl(false)} onOpen={() => {
            setQl(false);
            openItems([leadItem]);
          }}
        />
      ) : null}
      {infoItem ? <InfoPanel item={infoItem} fsv={fsv} onClose={() => setInfoPath(null)} /> : null}
    </div>
  );
}
