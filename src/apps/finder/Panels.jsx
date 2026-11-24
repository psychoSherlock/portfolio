// Quick Look panel and Get Info popover (both live inside the Finder window).
import { useMemo } from "react";
import { LuX } from "react-icons/lu";
import { dirname, formatSize, tilde } from "../../os/fs";
import FileIcon from "./FileIcon";
import Preview from "./Preview";
import { countLabel, defaultAppName, displayName, folderInfo, formatDate, kindLabel } from "./util";

export function QuickLook({ item, fsv, onClose, onOpen }) {
  const app = defaultAppName(item);
  const openLabel = item.type === "dir" ? "Open" : app ? `Open with ${app}` : "Open";
  return (
    <div
      className="finder-ql-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="finder-ql" role="dialog" aria-label={`Quick Look: ${item.name}`}>
        <div className="finder-ql-head">
          <button type="button" className="os-icon-btn" title="Close (Space)" aria-label="Close" onClick={onClose}>
            <LuX />
          </button>
          <div className="finder-ql-title" title={item.name}>
            {item.name}
          </div>
          <button type="button" className="os-btn finder-ql-open" onClick={onOpen}>
            {openLabel}
          </button>
        </div>
        <div className="finder-ql-body">
          <Preview key={item.path} item={item} mode="full" version={fsv} />
        </div>
      </div>
    </div>
  );
}

export function InfoPanel({ item, fsv, onClose }) {
  const info = useMemo(() => {
    void fsv;
    return item.type === "dir" ? folderInfo(item.path) : null;
  }, [item.path, item.type, fsv]);
  const app = defaultAppName(item);
  const size = info
    ? `${formatSize(info.size)} for ${countLabel(info.count)}`
    : `${formatSize(item.size)}${item.size >= 1024 ? ` (${item.size.toLocaleString()} bytes)` : ""}`;
  const name = item.path === "/" || item.type === "dir" ? displayName(item.path) : item.name;
  return (
    <div className="finder-info" role="dialog" aria-label={`${name} Info`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="finder-info-head">
        <FileIcon item={item} size={44} />
        <div className="finder-info-title">
          <div className="finder-info-name" title={name}>
            {name}
          </div>
          <div className="finder-info-sub">{info ? formatSize(info.size) : formatSize(item.size)}</div>
        </div>
        <button type="button" className="os-icon-btn" aria-label="Close" title="Close" onClick={onClose}>
          <LuX />
        </button>
      </div>
      <dl className="finder-meta finder-info-table os-selectable">
        <dt>Kind</dt>
        <dd>{kindLabel(item)}</dd>
        <dt>Size</dt>
        <dd>{size}</dd>
        <dt>Where</dt>
        <dd>{item.path === "/" ? "--" : tilde(dirname(item.path))}</dd>
        <dt>Modified</dt>
        <dd>{formatDate(item.mtime)}</dd>
        {item.trashedFrom ? (
          <>
            <dt>Original</dt>
            <dd>{tilde(dirname(item.trashedFrom))}</dd>
          </>
        ) : null}
        {app ? (
          <>
            <dt>Opens with</dt>
            <dd>{app}</dd>
          </>
        ) : null}
        <dt>Origin</dt>
        <dd>{item.builtin ? "Part of SherlockOS" : "Created by you"}</dd>
      </dl>
    </div>
  );
}
