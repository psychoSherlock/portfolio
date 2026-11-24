// Preview — images (zoom/pan/siblings), PDFs (native viewer), video/audio, empty state.
import { useCallback, useEffect, useState } from "react";
import { LuFileQuestion, LuFolderSearch } from "react-icons/lu";
import fs, { useFs, dirname } from "../../os/fs";
import { wm } from "../../os/windowStore";
import ImageView from "./ImageView";
import "./preview.css";

export default function Preview({ windowId, propsVersion, path: pathProp }) {
  useFs();
  const [path, setPath] = useState(pathProp || null);

  useEffect(() => {
    setPath(pathProp || null);
  }, [pathProp, propsVersion]);

  const navigate = useCallback((p) => setPath(p), []);

  const st = path ? fs.stat(path) : null;
  const url = path ? fs.url(path) : null;

  useEffect(() => {
    if (st) wm.setTitle(windowId, st.name);
    else wm.setTitle(windowId, "Preview");
  }, [windowId, st?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const showInFinder = () => wm.open("finder", { path: st ? dirname(path) : "/home/sherlock", select: path });

  let body;
  if (st && st.kind === "image" && url) {
    return (
      <div className="preview-root">
        <ImageView windowId={windowId} path={path} onNavigate={navigate} />
      </div>
    );
  }
  if (st && url && st.kind === "pdf") {
    body = <iframe className="preview-frame" title={st.name} src={url} />;
  } else if (st && url && st.kind === "video") {
    body = (
      <div className="preview-media">
        <video src={url} controls playsInline />
      </div>
    );
  } else if (st && url && st.kind === "audio") {
    body = (
      <div className="preview-media preview-audio">
        <span className="os-toolbar-title">{st.name}</span>
        <audio src={url} controls />
      </div>
    );
  } else {
    body = (
      <div className="preview-empty">
        <LuFileQuestion size={40} />
        <h3>{st ? "Can't preview this file" : path ? "File not found" : "No file selected"}</h3>
        <p>{path || "Open a file from Finder to preview it."}</p>
        {st && (
          <button className="os-btn" onClick={showInFinder}>
            <LuFolderSearch size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Show in Finder
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="preview-root">
      <div className="os-toolbar" data-window-drag>
        <span className="os-toolbar-title">{st?.name || "Preview"}</span>
        <div className="os-toolbar-spacer" />
        {st && (
          <button className="os-icon-btn" title="Show in Finder" aria-label="Show in Finder" onClick={showInFinder}>
            <LuFolderSearch size={16} />
          </button>
        )}
      </div>
      {body}
    </div>
  );
}
