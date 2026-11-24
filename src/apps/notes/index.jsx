// Notes — two-pane markdown notes stored in ~/Documents/Notes with debounced autosave.
import { useCallback, useEffect, useRef, useState } from "react";
import { LuSquarePen, LuTrash2 } from "react-icons/lu";
import fs, { HOME, useFs, join } from "../../os/fs";
import "./notes.css";

const DIR = `${HOME}/Documents/Notes`;

const WELCOME = `# Welcome to Notes

A quick tour of the keyboard shortcuts in SherlockOS:

- Ctrl/Cmd + K: Spotlight search
- F3: Mission Control
- Alt + W: close window
- Alt + M: minimize window
- Alt + Enter: zoom (maximize) window

Notes are saved automatically as markdown files in ~/Documents/Notes.
`;
const IDEAS = `# Ideas

- Write up a new CTF challenge
- Re-read my favourite bug bounty reports
`;

function seed() {
  if (fs.exists(DIR)) return;
  fs.mkdir(DIR);
  fs.writeText(join(DIR, "Welcome.md"), WELCOME);
  fs.writeText(join(DIR, "Ideas.md"), IDEAS);
}

const titleOf = (name) => name.replace(/\.md$/i, "");
const listNotes = () =>
  fs.exists(DIR) ? fs.list(DIR).filter((n) => n.type === "file" && n.kind === "markdown").sort((a, b) => (b.mtime || 0) - (a.mtime || 0)) : [];

export default function Notes() {
  useFs();
  const [sel, setSel] = useState(null);
  const [text, setText] = useState("");
  const timer = useRef(0);
  const pending = useRef(null);

  useEffect(() => {
    seed();
  }, []);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current) {
      const { path, text: t } = pending.current;
      pending.current = null;
      if (fs.exists(path)) fs.writeText(path, t);
    }
  }, []);
  useEffect(() => flush, [flush]);

  const notes = listNotes();
  const selected = sel && fs.exists(sel) ? sel : notes[0]?.path || null;

  useEffect(() => {
    let live = true;
    if (!selected) {
      setText("");
      return undefined;
    }
    fs.readText(selected).then((t) => live && setText(t));
    return () => {
      live = false;
    };
  }, [selected]);

  const pick = (p) => {
    flush();
    setSel(p);
  };

  const onChange = (e) => {
    const t = e.target.value;
    setText(t);
    pending.current = { path: selected, text: t };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };

  const create = () => {
    flush();
    const p = fs.createFile(DIR, "New Note.md", "# New Note\n\n");
    setSel(p);
  };

  const remove = () => {
    if (!selected) return;
    pending.current = null;
    clearTimeout(timer.current);
    fs.trash(selected);
    setSel(null);
  };

  return (
    <div className="notes-root">
      <aside className="notes-side">
        <div className="notes-side-top os-toolbar" data-window-drag>
          <span className="os-toolbar-title">Notes</span>
        </div>
        <ul className="notes-list os-scroll">
          {notes.map((n) => (
            <li key={n.path}>
              <button className="notes-item" aria-pressed={n.path === selected} onClick={() => pick(n.path)}>
                <b>{titleOf(n.name)}</b>
                <small>{n.mtime ? new Date(n.mtime).toLocaleDateString() : ""}</small>
              </button>
            </li>
          ))}
          {!notes.length && <li className="notes-empty">No notes yet.</li>}
        </ul>
      </aside>
      <div className="notes-main">
        <div className="os-toolbar" data-window-drag>
          <div className="os-toolbar-spacer" />
          <button className="os-icon-btn" title="Delete note" aria-label="Delete note" disabled={!selected} onClick={remove}>
            <LuTrash2 size={16} />
          </button>
          <button className="os-icon-btn" title="New note" aria-label="New note" onClick={create}>
            <LuSquarePen size={16} />
          </button>
        </div>
        {selected ? (
          <textarea className="notes-editor os-scroll" value={text} onChange={onChange} spellCheck={false} aria-label="Note text" />
        ) : (
          <div className="notes-blank">Select or create a note.</div>
        )}
      </div>
    </div>
  );
}
