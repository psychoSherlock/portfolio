// Bookmarks + history sidebar.
import { memo, useMemo, useState } from "react";
import { LuSearch, LuTrash2, LuX } from "react-icons/lu";
import { Favicon } from "./Favicon";
import { filterItems, groupByDay, linkProps, timeOf } from "./lib";
import { useSafari, safari } from "./store";
import { displayHost } from "./urls";

const Item = memo(function Item({ item, nav, current, meta, onRemove, removeLabel }) {
  return (
    <div className={`safari-side-item${current ? " is-current" : ""}`}>
      <a className="safari-side-link" {...linkProps(item.url, nav)} title={item.url} draggable={false}>
        <Favicon url={item.url} size={16} />
        <span className="safari-side-text">
          <span className="safari-side-title">{item.title || displayHost(item.url)}</span>
          <span className="safari-side-sub">
            {displayHost(item.url) || item.url}
            {meta ? ` · ${meta}` : ""}
          </span>
        </span>
      </a>
      <button type="button" className="safari-side-remove" aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
        <LuX size={12} />
      </button>
    </div>
  );
});

export const Sidebar = memo(function Sidebar({ nav, currentUrl }) {
  const tab = useSafari((s) => s.sidebarTab);
  const bookmarks = useSafari((s) => s.bookmarks);
  const history = useSafari((s) => s.history);
  const [q, setQ] = useState("");

  const list = useMemo(() => filterItems(tab === "history" ? history : bookmarks, q), [tab, history, bookmarks, q]);
  const groups = useMemo(() => (tab === "history" ? groupByDay(list.slice(0, 300)) : null), [tab, list]);

  return (
    <aside className="safari-sidebar" aria-label="Bookmarks and history">
      <div className="safari-segmented safari-side-seg" role="tablist">
        {[
          ["bookmarks", "Bookmarks"],
          ["history", "History"],
        ].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => safari.setSidebarTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <label className="safari-search-field safari-side-search">
        <LuSearch size={12} aria-hidden="true" />
        <input
          className="os-selectable"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === "history" ? "Search History" : "Search Bookmarks"}
          aria-label={tab === "history" ? "Search history" : "Search bookmarks"}
          spellCheck={false}
        />
      </label>

      <div className="safari-side-list os-scroll">
        {list.length === 0 && (
          <p className="safari-side-empty">
            {q ? "No matches." : tab === "history" ? "No history yet." : "No bookmarks yet. Use the star in the address bar."}
          </p>
        )}
        {tab === "bookmarks" &&
          list.map((b) => (
            <Item
              key={b.url}
              item={b}
              nav={nav}
              current={b.url === currentUrl}
              removeLabel="Remove bookmark"
              onRemove={() => safari.removeBookmark(b.url)}
            />
          ))}
        {groups &&
          groups.map((g) => (
            <section key={g.key}>
              <h3 className="safari-side-day">{g.label}</h3>
              {g.items.map((h) => (
                <Item
                  key={`${h.time}|${h.url}`}
                  item={h}
                  nav={nav}
                  current={h.url === currentUrl}
                  meta={timeOf(h.time)}
                  removeLabel="Remove from history"
                  onRemove={() => safari.removeHistory(h.time)}
                />
              ))}
            </section>
          ))}
      </div>

      {tab === "history" && (
        <div className="safari-side-foot">
          <button type="button" className="os-btn" disabled={!history.length} onClick={() => safari.clearHistory()}>
            <LuTrash2 size={12} /> Clear History
          </button>
        </div>
      )}
    </aside>
  );
});
