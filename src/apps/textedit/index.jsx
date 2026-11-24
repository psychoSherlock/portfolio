// TextEdit — plain-text editor with a rendered view for markdown files.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuEye, LuPencil, LuSave } from "react-icons/lu";
import fs, { HOME, basename, dirname, extname, join } from "../../os/fs";
import { wm } from "../../os/windowStore";
import { openPath, openUrl, openExternal } from "../../os/open";
import { renderMarkdown, classifyLink, handleTab } from "./lib";
import "./textedit.css";

const DOCS = `${HOME}/Documents`;

export default function TextEdit({ windowId, propsVersion, path: pathProp }) {
  const [path, setPath] = useState(pathProp || null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(!!pathProp);
  const [mode, setMode] = useState("edit");
  const [name, setName] = useState("Untitled.txt");
  const [dir, setDir] = useState(DOCS);
  const [error, setError] = useState("");
  const taRef = useRef(null);

  useEffect(() => {
    let live = true;
    setPath(pathProp || null);
    setError("");
    if (!pathProp) {
      setText("");
      setSaved("");
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    fs.readText(pathProp)
      .then((t) => {
        if (!live) return;
        setText(t);
        setSaved(t);
        setMode(extname(pathProp) === "md" || extname(pathProp) === "markdown" ? "read" : "edit");
        setLoading(false);
      })
      .catch(() => live && (setText(""), setLoading(false)));
    return () => {
      live = false;
    };
  }, [pathProp, propsVersion]);

  const dirty = text !== saved;
  const title = path ? basename(path) : name;
  const isMd = !!path && ["md", "markdown"].includes(extname(path));

  useEffect(() => {
    wm.setTitle(windowId, `${dirty ? "● " : ""}${title}`);
  }, [windowId, title, dirty]);

  const save = useCallback(() => {
    try {
      if (path) {
        fs.writeText(path, text);
        setSaved(text);
        return;
      }
      const n = name.trim();
      if (!n || n.includes("/")) {
        setError("Enter a valid file name.");
        return;
      }
      const target = join(dir, n);
      fs.mkdir(dir);
      fs.writeText(target, text);
      setPath(target);
      setSaved(text);
      setError("");
    } catch {
      setError("Could not save the file.");
    }
  }, [path, text, name, dir]);

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    } else if (e.key === "Tab") handleTab(e);
  };

  const md = useMemo(() => (isMd && mode === "read" ? renderMarkdown(text, path ? dirname(path) : DOCS) : null), [isMd, mode, text, path]);

  const onMdClick = (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a) return;
    e.preventDefault();
    const c = classifyLink(a.getAttribute("href"), path ? dirname(path) : DOCS);
    if (c.type === "url") openUrl(c.url);
    else if (c.type === "external") openExternal(c.url);
    else if (c.type === "path") openPath(c.path);
    else if (c.type === "anchor") {
      const h = [...e.currentTarget.querySelectorAll("[data-slug]")].find((x) => x.dataset.slug === c.slug);
      h?.scrollIntoView({ block: "start" });
    }
  };

  return (
    <div className="textedit-root" onKeyDown={onKeyDown}>
      <div className="os-toolbar" data-window-drag>
        <span className="os-toolbar-title">
          {dirty && <span className="textedit-dot" aria-label="Unsaved changes" />}
          {title}
        </span>
        <div className="os-toolbar-spacer" />
        {isMd && (
          <button
            className="os-icon-btn"
            title={mode === "read" ? "Edit" : "Read"}
            aria-label={mode === "read" ? "Edit" : "Read"}
            onClick={() => setMode((m) => (m === "read" ? "edit" : "read"))}
          >
            {mode === "read" ? <LuPencil size={16} /> : <LuEye size={16} />}
          </button>
        )}
        <button className="os-icon-btn" title="Save (Ctrl+S)" aria-label="Save" disabled={!dirty && !!path} onClick={save}>
          <LuSave size={16} />
        </button>
      </div>
      {!path && (
        <div className="textedit-savebar">
          <label>
            Save as
            <input className="os-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="File name" />
          </label>
          <label>
            Where
            <input className="os-input" value={dir} onChange={(e) => setDir(e.target.value)} aria-label="Folder" />
          </label>
          <button className="os-btn os-btn--primary" onClick={save}>
            Save
          </button>
          {error && <span className="textedit-error">{error}</span>}
        </div>
      )}
      {loading ? (
        <div className="textedit-loading">
          <span className="os-spinner" />
        </div>
      ) : md ? (
        <div className="textedit-md os-scroll os-selectable" onClick={onMdClick} dangerouslySetInnerHTML={{ __html: md.html }} />
      ) : (
        <textarea
          ref={taRef}
          className="textedit-area os-scroll"
          value={text}
          spellCheck={false}
          autoFocus
          aria-label="Document text"
          placeholder={path ? "" : "Start typing…"}
          onChange={(e) => setText(e.target.value)}
        />
      )}
    </div>
  );
}
