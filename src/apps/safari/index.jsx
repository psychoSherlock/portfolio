// Safari — tabbed web browser for SherlockOS.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { LuBookmark, LuChevronLeft, LuChevronRight, LuCopy, LuExternalLink, LuLayoutGrid, LuPanelLeft, LuShare } from "react-icons/lu";
import { openExternal } from "../../os/open";
import { ui } from "../../os/ui";
import { useWindows, wm } from "../../os/windowStore";
import { AddressBar } from "./AddressBar";
import { Sidebar } from "./Sidebar";
import { TabBar, TabOverview } from "./TabBar";
import { TabView } from "./WebView";
import { currentEntry, safari, useSafari } from "./store";
import { externalUrl, guessTitle } from "./urls";
import "./safari.css";

const NARROW = 600; // tab strip collapses into a tab-count button
const SIDEBAR_MIN = 760; // below this the sidebar is hidden

// Props are window-scoped and survive remounts; remember which (window, version) pairs were opened.
const handledProps = new Set();

const isTyping = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

export default function Safari({ windowId, propsVersion = 0, url }) {
  const tabs = useSafari((s) => s.tabs);
  const activeId = useSafari((s) => s.activeId);
  const sidebarOpen = useSafari((s) => s.sidebarOpen);
  const active = tabs.find((t) => t.id === activeId) || tabs[0];
  const entry = currentEntry(active);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [width, setWidth] = useState(1040);
  const [overview, setOverview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const narrow = width < NARROW;
  const showSidebar = sidebarOpen && width >= SIDEBAR_MIN;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // Another app called openUrl(url): open it in a new, focused tab.
  useEffect(() => {
    if (!url) return;
    const key = `${windowId}:${propsVersion}`;
    if (handledProps.has(key)) return;
    handledProps.add(key);
    safari.newTab(url);
    setOverview(false);
  }, [url, propsVersion, windowId]);

  useEffect(() => {
    wm.setTitle(windowId, entry.title || guessTitle(entry.url));
  }, [windowId, entry.title, entry.url]);

  const closeOverview = useCallback(() => setOverview(false), []);

  const focusAddress = useCallback(() => {
    setOverview(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const newTab = useCallback(() => {
    safari.newTab();
    focusAddress();
  }, [focusAddress]);

  const closeTab = useCallback(
    (id) => {
      if (!safari.closeTab(id)) wm.close(windowId);
    },
    [windowId]
  );

  const nav = useCallback((target, opts = {}) => {
    if (opts.newTab) safari.newTab(target, { background: !!opts.background });
    else safari.navigate(safari.activeId, target);
  }, []);

  // Keyboard shortcuts while this window is focused. (Keys typed inside a framed
  // page never reach us — that's the browser's security boundary.)
  useEffect(() => {
    const onKey = (e) => {
      if (useWindows.getState().activeId !== windowId) return;
      const id = safari.activeId;
      const mod = e.ctrlKey || e.metaKey;
      let handled = true;
      if (mod && !e.altKey && !e.shiftKey && e.code === "KeyL") focusAddress();
      else if (e.altKey && !mod && e.code === "KeyD") focusAddress();
      else if (e.altKey && !mod && e.code === "KeyT") newTab();
      else if (e.altKey && !mod && e.code === "KeyW") closeTab(id);
      else if (e.altKey && !mod && e.code === "KeyR") safari.reload(id);
      else if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) {
        const list = safari.tabs;
        const n = Number(e.code.slice(5));
        safari.activate((n === 9 ? list[list.length - 1] : list[n - 1] || list[list.length - 1]).id);
      } else if (e.altKey && !mod && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !isTyping(e.target)) {
        safari.go(id, e.key === "ArrowLeft" ? -1 : 1);
      } else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [windowId, focusAddress, newTab, closeTab]);

  const canBack = active.index > 0;
  const canFwd = active.index < active.entries.length - 1;
  const ext = externalUrl(entry.url);
  const bookmarked = useSafari((s) => s.bookmarks.some((b) => b.url === entry.url));

  const historyMenu = (e, dir) => {
    e.preventDefault();
    const list =
      dir < 0
        ? active.entries.slice(0, active.index).map((en, i) => ({ en, delta: i - active.index })).reverse()
        : active.entries.slice(active.index + 1).map((en, i) => ({ en, delta: i + 1 }));
    if (!list.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    ui.showContextMenu(
      r.left,
      r.bottom + 6,
      list.slice(0, 15).map(({ en, delta }) => ({ label: en.title, onClick: () => safari.go(active.id, delta) }))
    );
  };

  const shareMenu = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    ui.showContextMenu(r.left, r.bottom + 6, [
      {
        label: "Copy Link",
        icon: LuCopy,
        disabled: !ext && !entry.url.startsWith("sherlock://"),
        onClick: () => navigator.clipboard?.writeText(ext || entry.url).catch(() => {}),
      },
      { label: "Open in Real Browser Tab", icon: LuExternalLink, disabled: !ext, onClick: () => openExternal(ext) },
      { separator: true },
      {
        label: bookmarked ? "Remove Bookmark" : "Add Bookmark",
        icon: LuBookmark,
        onClick: () => safari.toggleBookmark(entry.url, entry.title),
      },
    ]);
  };

  return (
    <div
      ref={rootRef}
      className={`safari${narrow ? " is-narrow" : ""}${dragging ? " is-dragging-tab" : ""}`}
    >
      <div className="os-toolbar safari-toolbar" data-window-drag>
        {width >= SIDEBAR_MIN && (
          <button
            type="button"
            className="os-icon-btn"
            aria-label="Show sidebar"
            aria-pressed={sidebarOpen}
            title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            onClick={() => safari.toggleSidebar()}
          >
            <LuPanelLeft size={16} />
          </button>
        )}
        <div className="safari-navbtns">
          <button
            type="button"
            className="os-icon-btn"
            aria-label="Back"
            title="Back (Alt ←)"
            disabled={!canBack}
            onClick={() => safari.go(active.id, -1)}
            onContextMenu={(e) => historyMenu(e, -1)}
          >
            <LuChevronLeft size={19} />
          </button>
          <button
            type="button"
            className="os-icon-btn safari-fwd"
            aria-label="Forward"
            title="Forward (Alt →)"
            disabled={!canFwd}
            onClick={() => safari.go(active.id, 1)}
            onContextMenu={(e) => historyMenu(e, 1)}
          >
            <LuChevronRight size={19} />
          </button>
        </div>
        <div className="safari-addr-wrap">
          <AddressBar
            tabId={active.id}
            url={entry.url}
            title={entry.title}
            loading={active.loading}
            loadSeq={`${active.id}|${active.index}|${entry.url}|${active.reloadKey}`}
            inputRef={inputRef}
          />
        </div>
        <button type="button" className="os-icon-btn" aria-label="Share" title="Share" onClick={shareMenu}>
          <LuShare size={15} />
        </button>
        {narrow ? (
          <button
            type="button"
            className="os-icon-btn safari-tabcount"
            aria-label={`Show all tabs (${tabs.length} open)`}
            aria-pressed={overview}
            onClick={() => setOverview((v) => !v)}
          >
            <span>{tabs.length > 99 ? "∞" : tabs.length}</span>
          </button>
        ) : (
          <button
            type="button"
            className="os-icon-btn"
            aria-label="Show tab overview"
            aria-pressed={overview}
            title="Show Tab Overview"
            onClick={() => setOverview((v) => !v)}
          >
            <LuLayoutGrid size={15} />
          </button>
        )}
      </div>

      {!narrow && (
        <TabBar tabs={tabs} activeId={active.id} onClose={closeTab} onNewTab={newTab} onDragState={setDragging} />
      )}

      <div className="safari-body">
        {showSidebar && <Sidebar nav={nav} currentUrl={entry.url} />}
        <main className="safari-content">
          {tabs.map((t) => (
            <TabView key={t.id} tab={t} active={t.id === active.id} nav={nav} />
          ))}
          <AnimatePresence>
            {overview && (
              <TabOverview
                tabs={tabs}
                activeId={active.id}
                onClose={closeTab}
                onNewTab={newTab}
                onDone={closeOverview}
              />
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
