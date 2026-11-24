// Unified address/search field: domain + lock when idle, full URL while editing,
// with an autocomplete list built from history, bookmarks and internal pages.
import { memo, useMemo, useState } from "react";
import { motion as Motion } from "framer-motion";
import { LuArrowUpRight, LuBookmark, LuClock, LuCompass, LuLock, LuRotateCw, LuSearch, LuStar, LuX } from "react-icons/lu";
import { searchUrl } from "./embeddable";
import { Favicon } from "./Favicon";
import { useSafari, safari } from "./store";
import { INTERNAL_PAGES, START, classify, displayHost, editableUrl, guessTitle, isSecure, resolveInput } from "./urls";

const MAX_MATCHES = 6;
const KIND_LABEL = { page: "SherlockOS", bookmark: "Bookmark", history: "History" };
const KIND_ICON = { page: LuCompass, bookmark: LuBookmark, history: LuClock };

const bareUrl = (u) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/^sherlock:\/\//, "");

function score(item, q) {
  const u = bareUrl(item.url);
  const title = (item.title || "").toLowerCase();
  if (u.startsWith(q)) return 4;
  if (title.startsWith(q)) return 3;
  if (title.split(/[\s\-—|·:/]+/).some((w) => w.startsWith(q))) return 2;
  if (u.includes(q) || title.includes(q)) return 1;
  return 0;
}

function buildSuggestions(text, history, bookmarks) {
  const raw = text.trim();
  if (!raw) return [];
  const q = raw.toLowerCase();
  const out = [];
  const resolved = resolveInput(raw);
  const search = searchUrl(raw);
  if (resolved !== search) {
    out.push({ kind: "go", url: resolved, title: guessTitle(resolved), sub: displayHost(resolved) || resolved });
  }
  out.push({ kind: "search", url: search, title: raw, sub: "Google Search" });

  const seen = new Set([resolved, search]);
  const pool = new Map();
  const add = (item, kind, weight) => {
    if (seen.has(item.url)) return;
    const s = score(item, q);
    if (!s) return;
    const prev = pool.get(item.url);
    if (prev) prev.freq += 1;
    else pool.set(item.url, { kind, url: item.url, title: item.title || guessTitle(item.url), s: s + weight, freq: 1 });
  };
  INTERNAL_PAGES.forEach((p) => p.url !== START && add(p, "page", 0.2));
  bookmarks.forEach((b) => add(b, "bookmark", 0.5));
  history.forEach((h) => add(h, "history", 0));
  const matches = [...pool.values()].sort((a, b) => b.s - a.s || b.freq - a.freq).slice(0, MAX_MATCHES);
  return [...out, ...matches.map((m) => ({ ...m, sub: displayHost(m.url) || m.url }))];
}

function Highlight({ text, q }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const Suggestion = memo(function Suggestion({ s, q, selected, onPick, onHover, index }) {
  const Icon = KIND_ICON[s.kind];
  return (
    <li
      role="option"
      aria-selected={selected}
      className={`safari-suggest-row${selected ? " is-selected" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => onHover(index)}
      onClick={() => onPick(s.url)}
    >
      <span className="safari-suggest-icon">
        {s.kind === "search" ? <LuSearch size={14} /> : s.kind === "go" ? <LuArrowUpRight size={15} /> : <Favicon url={s.url} size={16} />}
      </span>
      <span className="safari-suggest-text">
        <span className="safari-suggest-title">
          {s.kind === "search" ? (
            <>
              <b>{s.title}</b>
            </>
          ) : (
            <Highlight text={s.title} q={q} />
          )}
        </span>
        <span className="safari-suggest-sub">
          {s.kind === "go" ? "Go to site" : <Highlight text={s.sub} q={q} />}
        </span>
      </span>
      {Icon && (
        <span className="safari-suggest-kind">
          <Icon size={11} /> {KIND_LABEL[s.kind]}
        </span>
      )}
    </li>
  );
});

export const AddressBar = memo(function AddressBar({ tabId, url, title, loading, loadSeq, inputRef }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [typed, setTyped] = useState(false);
  const [sel, setSel] = useState(-1);
  const history = useSafari((s) => s.history);
  const bookmarks = useSafari((s) => s.bookmarks);
  const bookmarked = bookmarks.some((b) => b.url === url);

  const suggestions = useMemo(
    () => (focused && typed ? buildSuggestions(draft, history, bookmarks) : []),
    [focused, typed, draft, history, bookmarks]
  );
  const open = suggestions.length > 0;

  const c = classify(url);
  const isStart = url === START;
  const host = displayHost(url);
  const secure = isSecure(url);
  const web = c.kind === "web" || (c.kind === "internal" && c.page === "github");

  const go = (target) => {
    const t = String(target || "").trim();
    if (!t) return;
    safari.navigate(tabId, t);
    setTyped(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(sel >= 0 && suggestions[sel] ? suggestions[sel].url : draft);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (open && sel >= 0) {
        setSel(-1);
        return;
      }
      setDraft(editableUrl(url));
      setTyped(false);
      inputRef.current?.blur();
    }
  };

  const q = draft.trim();

  return (
    <div className={`safari-addr${focused ? " is-focused" : ""}${open ? " is-open" : ""}`}>
      <span className="safari-addr-lead" aria-hidden="true">
        {focused && <LuSearch size={13} />}
      </span>
      <input
        ref={inputRef}
        className="safari-addr-input os-selectable"
        value={focused ? draft : ""}
        aria-label="Address and search"
        role="combobox"
        aria-expanded={open}
        aria-controls="safari-suggestions"
        aria-autocomplete="list"
        placeholder={focused ? "Search or enter website name" : ""}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        onFocus={(e) => {
          setFocused(true);
          setDraft(editableUrl(url));
          setTyped(false);
          setSel(-1);
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onBlur={() => {
          setFocused(false);
          setTyped(false);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setTyped(true);
          setSel(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {!focused && (
        <span className="safari-addr-display" aria-hidden="true" title={url}>
          {isStart ? (
            <span className="safari-addr-placeholder">
              <LuSearch size={13} /> Search or enter website name
            </span>
          ) : (
            <>
              {web && secure && <LuLock size={11} className="safari-addr-lock" />}
              {web && !secure && <span className="safari-addr-insecure">Not Secure —</span>}
              <span className="safari-addr-host">{host || title}</span>
            </>
          )}
        </span>
      )}
      {!focused && !isStart && (
        <span className="safari-addr-trail">
          <button
            type="button"
            className="safari-addr-btn"
            aria-pressed={bookmarked}
            aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"}
            title={bookmarked ? "Remove Bookmark" : "Add Bookmark"}
            onClick={() => safari.toggleBookmark(url, title)}
          >
            <LuStar size={13} className={bookmarked ? "safari-star-on" : ""} />
          </button>
          <button
            type="button"
            className="safari-addr-btn"
            aria-label={loading ? "Stop loading" : "Reload page"}
            title={loading ? "Stop" : "Reload (Alt R)"}
            onClick={() => (loading ? safari.setLoading(tabId, false) : safari.reload(tabId))}
          >
            {loading ? <LuX size={13} /> : <LuRotateCw size={12} />}
          </button>
        </span>
      )}

      <Motion.span
        key={loadSeq}
        className="safari-progress"
        aria-hidden="true"
        initial={{ scaleX: 0, opacity: loading ? 1 : 0 }}
        animate={
          loading
            ? {
                scaleX: 0.88,
                opacity: 1,
                transition: { scaleX: { duration: 7, ease: [0.08, 0.7, 0.2, 1] }, opacity: { duration: 0.1 } },
              }
            : { scaleX: 1, opacity: 0, transition: { scaleX: { duration: 0.2 }, opacity: { duration: 0.35, delay: 0.15 } } }
        }
      />

      {open && (
        <ul id="safari-suggestions" className="safari-suggest" role="listbox" aria-label="Suggestions">
          {suggestions.map((s, i) => (
            <Suggestion key={s.kind + s.url} s={s} q={q} index={i} selected={i === sel} onPick={go} onHover={setSel} />
          ))}
        </ul>
      )}
    </div>
  );
});
