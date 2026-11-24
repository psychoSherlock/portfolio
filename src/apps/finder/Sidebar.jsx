// Finder sidebar: Favorites + Locations. Every entry is also a drop target.
import { memo } from "react";
import {
  LuDownload,
  LuFileText,
  LuFolderCode,
  LuHardDrive,
  LuHouse,
  LuImage,
  LuMonitor,
  LuMusic,
  LuTrash2,
} from "react-icons/lu";
import fs, { DESKTOP, HOME, TRASH } from "../../os/fs";

const FAVORITES = [
  { path: HOME, label: "Home", icon: LuHouse },
  { path: DESKTOP, label: "Desktop", icon: LuMonitor },
  { path: `${HOME}/Documents`, label: "Documents", icon: LuFileText },
  { path: `${HOME}/Downloads`, label: "Downloads", icon: LuDownload },
  { path: `${HOME}/Pictures`, label: "Pictures", icon: LuImage },
  { path: `${HOME}/Projects`, label: "Projects", icon: LuFolderCode },
  { path: `${HOME}/Music`, label: "Music", icon: LuMusic },
];

const LOCATIONS = [
  { path: "/", label: "SherlockOS", icon: LuHardDrive },
  { path: TRASH, label: "Trash", icon: LuTrash2 },
];

function Entry({ entry, active, onNavigate, onMenu, badge }) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      className="finder-side-item"
      aria-current={active ? "true" : undefined}
      data-finder-drop={entry.path}
      data-no-drag
      onClick={() => onNavigate(entry.path)}
      onContextMenu={(e) => onMenu(e, entry.path)}
    >
      <Icon aria-hidden="true" />
      <span>{entry.label}</span>
      {badge ? <em className="finder-side-badge">{badge}</em> : null}
    </button>
  );
}

function Sidebar({ cwd, onNavigate, onMenu, overlay }) {
  // fsv (prop) re-renders this when folders appear/disappear
  const favorites = FAVORITES.filter((f) => fs.isDir(f.path));
  const trashCount = fs.list(TRASH, { hidden: true }).length;
  return (
    <aside className={`finder-sidebar${overlay ? " finder-sidebar--overlay" : ""}`} aria-label="Sidebar">
      <div className="finder-sidebar-drag" data-window-drag />
      <nav className="finder-sidebar-nav os-scroll">
        <div className="finder-side-title">Favorites</div>
        {favorites.map((f) => (
          <Entry key={f.path} entry={f} active={cwd === f.path} onNavigate={onNavigate} onMenu={onMenu} />
        ))}
        <div className="finder-side-title">Locations</div>
        {LOCATIONS.map((f) => (
          <Entry
            key={f.path}
            entry={f}
            active={cwd === f.path}
            onNavigate={onNavigate}
            onMenu={onMenu}
            badge={f.path === TRASH && trashCount ? trashCount : null}
          />
        ))}
      </nav>
    </aside>
  );
}

export default memo(Sidebar);
