// Compact Safari tab strip (drag to reorder) and the tab overview grid.
import { memo, useEffect } from "react";
import { motion as Motion, Reorder } from "framer-motion";
import { LuBookmark, LuCopy, LuExternalLink, LuPlus, LuX } from "react-icons/lu";
import { openExternal } from "../../os/open";
import { ui } from "../../os/ui";
import { Favicon } from "./Favicon";
import { currentEntry, safari } from "./store";
import { displayHost, externalUrl } from "./urls";

function tabMenu(e, tab, onClose) {
  e.preventDefault();
  e.stopPropagation();
  const { url, title } = currentEntry(tab);
  const ext = externalUrl(url);
  const many = safari.tabs.length > 1;
  ui.showContextMenu(e.clientX, e.clientY, [
    { label: "New Tab", icon: LuPlus, shortcut: "Alt T", onClick: () => safari.newTab() },
    { label: "Duplicate Tab", icon: LuCopy, onClick: () => safari.duplicateTab(tab.id) },
    { separator: true },
    { label: "Reload Tab", onClick: () => safari.reload(tab.id) },
    ext && { label: "Open in Real Browser Tab", icon: LuExternalLink, onClick: () => openExternal(ext) },
    {
      label: safari.bookmarks.some((b) => b.url === url) ? "Remove Bookmark" : "Add Bookmark",
      icon: LuBookmark,
      onClick: () => safari.toggleBookmark(url, title),
    },
    { label: "Copy Link", onClick: () => navigator.clipboard?.writeText(ext || url).catch(() => {}) },
    { separator: true },
    { label: "Close Tab", shortcut: "Alt W", onClick: () => onClose(tab.id) },
    { label: "Close Other Tabs", disabled: !many, onClick: () => safari.closeOthers(tab.id) },
  ]);
}

const TabItem = memo(function TabItem({ tab, active, onClose, onDragState }) {
  const { url, title } = currentEntry(tab);
  return (
    <Reorder.Item
      as="div"
      value={tab.id}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      title={title}
      className={`safari-tab${active ? " is-active" : ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      whileDrag={{ zIndex: 3 }}
      onDragStart={() => onDragState(true)}
      onDragEnd={() => onDragState(false)}
      onPointerDown={(e) => {
        if (e.button === 0 && !e.target.closest(".safari-tab-close")) safari.activate(tab.id);
      }}
      onMouseDown={(e) => e.button === 1 && e.preventDefault()}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose(tab.id);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          safari.cycleTab(e.key === "ArrowRight" ? 1 : -1);
        }
      }}
      onContextMenu={(e) => tabMenu(e, tab, onClose)}
    >
      <button
        type="button"
        className="safari-tab-close"
        aria-label={`Close ${title}`}
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
      >
        <LuX size={11} />
      </button>
      <span className="safari-tab-icon">
        {tab.loading ? <span className="safari-tab-spinner" aria-label="Loading" /> : <Favicon url={url} size={14} />}
      </span>
      <span className="safari-tab-title">{title}</span>
    </Reorder.Item>
  );
});

export const TabBar = memo(function TabBar({ tabs, activeId, onClose, onNewTab, onDragState }) {
  return (
    <div className="safari-tabbar">
      <Reorder.Group
        as="div"
        axis="x"
        role="tablist"
        aria-label="Tabs"
        className="safari-tabs"
        values={tabs.map((t) => t.id)}
        onReorder={(ids) => safari.reorder(ids)}
      >
        {tabs.map((t) => (
          <TabItem key={t.id} tab={t} active={t.id === activeId} onClose={onClose} onDragState={onDragState} />
        ))}
      </Reorder.Group>
      <button type="button" className="safari-tab-new os-icon-btn" aria-label="New tab" title="New Tab (Alt T)" onClick={onNewTab}>
        <LuPlus size={15} />
      </button>
    </div>
  );
});

const OverviewCard = memo(function OverviewCard({ tab, active, onPick, onClose }) {
  const { url, title } = currentEntry(tab);
  return (
    <div
      role="button"
      tabIndex={0}
      className={`safari-ov-card${active ? " is-active" : ""}`}
      onClick={() => onPick(tab.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(tab.id);
        }
      }}
      onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
      onContextMenu={(e) => tabMenu(e, tab, onClose)}
    >
      <div className="safari-ov-head">
        <Favicon url={url} size={14} />
        <span className="safari-ov-title">{title}</span>
        <button
          type="button"
          className="safari-ov-close"
          aria-label={`Close ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
        >
          <LuX size={12} />
        </button>
      </div>
      <div className="safari-ov-preview">
        <Favicon url={url} size={40} />
        <span>{displayHost(url) || title}</span>
      </div>
    </div>
  );
});

export function TabOverview({ tabs, activeId, onClose, onNewTab, onDone }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDone();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <Motion.div
      className="safari-overview os-scroll"
      role="dialog"
      aria-label="Tab overview"
      initial={{ opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="safari-ov-bar">
        <span className="safari-ov-count">
          {tabs.length} {tabs.length === 1 ? "Tab" : "Tabs"}
        </span>
        <button type="button" className="os-icon-btn" aria-label="New tab" onClick={onNewTab}>
          <LuPlus size={16} />
        </button>
        <button type="button" className="os-btn" onClick={onDone}>
          Done
        </button>
      </div>
      <div className="safari-ov-grid">
        {tabs.map((t) => (
          <OverviewCard
            key={t.id}
            tab={t}
            active={t.id === activeId}
            onClose={onClose}
            onPick={(id) => {
              safari.activate(id);
              onDone();
            }}
          />
        ))}
      </div>
    </Motion.div>
  );
}
