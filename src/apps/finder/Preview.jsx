// File preview used by Quick Look, the gallery stage and the column-view preview pane.
import { memo, useEffect, useState } from "react";
import fs, { formatSize, isTextKind } from "../../os/fs";
import FileIcon from "./FileIcon";
import { countLabel, folderInfo, kindLabel } from "./util";

function useText(path, mtime) {
  const [state, setState] = useState({ key: null, text: "" });
  const key = `${path}@${mtime}`;
  useEffect(() => {
    let alive = true;
    fs.readText(path)
      .then((text) => alive && setState({ key, text }))
      .catch(() => alive && setState({ key, text: "" }));
    return () => {
      alive = false;
    };
  }, [path, key]);
  return state.key === key ? state.text : null;
}

function TextPreview({ item, maxLines }) {
  const text = useText(item.path, item.mtime);
  if (text === null) {
    return (
      <div className="finder-pv-center">
        <span className="os-spinner" />
      </div>
    );
  }
  if (!text.trim()) return <Summary item={item} note="Empty file" />;
  const lines = text.split("\n");
  const shown = lines.slice(0, maxLines).join("\n");
  return (
    <pre className="finder-pv-text os-scroll os-selectable" data-no-drag>
      {shown}
      {lines.length > maxLines ? `\n\n… ${lines.length - maxLines} more lines` : ""}
    </pre>
  );
}

function Summary({ item, note }) {
  let detail = note;
  if (!detail) {
    if (item.type === "dir") {
      const info = folderInfo(item.path);
      detail = `${countLabel(info.count)} · ${formatSize(info.size)}`;
    } else detail = `${kindLabel(item)} · ${formatSize(item.size)}`;
  }
  return (
    <div className="finder-pv-center">
      <FileIcon item={item} size={112} />
      <div className="finder-pv-name">{item.name}</div>
      <div className="finder-pv-meta">{detail}</div>
    </div>
  );
}

/** mode: "full" (Quick Look / gallery) renders PDFs and long text; "compact" keeps it light. */
function Preview({ item, mode = "full" }) {
  const full = mode === "full";
  const url = item.type === "file" ? fs.url(item.path) : null;

  if (item.type === "dir") return <Summary item={item} />;
  if (item.kind === "image" && (url || fs.thumb(item.path))) {
    return (
      <div className="finder-pv-media">
        <img
          className="finder-pv-img"
          src={full ? url || fs.thumb(item.path) : fs.thumb(item.path) || url}
          alt={item.name}
          decoding="async"
          draggable={false}
        />
      </div>
    );
  }
  if (item.kind === "pdf" && url && full) {
    return (
      <iframe
        className="finder-pv-frame"
        title={item.name}
        src={`${url}#toolbar=0&navpanes=0&view=FitH`}
      />
    );
  }
  if (item.kind === "video" && url) {
    return (
      <div className="finder-pv-media">
        <video className="finder-pv-img" src={url} controls preload="metadata" data-no-drag />
      </div>
    );
  }
  if (item.kind === "audio" && url) {
    return (
      <div className="finder-pv-center">
        <FileIcon item={item} size={96} />
        <div className="finder-pv-name">{item.name}</div>
        <audio className="finder-pv-audio" src={url} controls preload="none" data-no-drag />
      </div>
    );
  }
  if (isTextKind(item.kind) || (item.kind === "unknown" && !url && (item.size || 0) < 200000)) {
    return <TextPreview item={item} maxLines={full ? 200 : 40} />;
  }
  return <Summary item={item} />;
}

export default memo(
  Preview,
  (a, b) =>
    a.mode === b.mode &&
    a.item.path === b.item.path &&
    a.item.mtime === b.item.mtime &&
    a.item.size === b.item.size &&
    a.item.type === b.item.type &&
    a.version === b.version
);
