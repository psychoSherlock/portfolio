// sherlock:// pages rendered natively: start, history, bookmarks, about, errors.
import { memo, useMemo, useState } from "react";
import { LuBookmark, LuClock, LuSearch, LuTrash2, LuTriangleAlert, LuX } from "react-icons/lu";
import safariIcon from "../../assets/images/icons/safari.png";
import { Favicon } from "./Favicon";
import { useSafari, safari } from "./store";
import { FAVORITES, START, classify, displayHost } from "./urls";
import { filterItems, groupByDay, isSearchUrl, linkProps, timeOf } from "./lib";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const Tile = memo(function Tile({ url, title, nav }) {
  return (
    <a className="safari-tile" {...linkProps(url, nav)} title={title} draggable={false}>
      <span className="safari-tile-icon">
        <Favicon url={url} size={32} />
      </span>
      <span className="safari-tile-label">{title}</span>
    </a>
  );
});

function StartPage({ nav }) {
  const history = useSafari((s) => s.history);
  const [q, setQ] = useState("");
  const [hello] = useState(greeting);

  const frequent = useMemo(() => {
    const fav = new Set(FAVORITES.map((f) => f.url));
    const count = new Map();
    for (const h of history) {
      if (fav.has(h.url) || isSearchUrl(h.url) || h.url.startsWith("sherlock://error")) continue;
      const cur = count.get(h.url);
      if (cur) cur.n++;
      else count.set(h.url, { url: h.url, title: h.title, n: 1, t: h.time });
    }
    return [...count.values()].sort((a, b) => b.n - a.n || b.t - a.t).slice(0, 8);
  }, [history]);

  return (
    <div className="safari-page safari-start os-scroll">
      <div className="safari-start-inner">
        <h1 className="safari-start-hello">{hello}</h1>
        <form
          className="safari-start-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) nav(q.trim());
          }}
        >
          <LuSearch size={17} aria-hidden="true" />
          <input
            className="os-selectable"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Google or enter website name"
            aria-label="Search or enter website name"
            spellCheck={false}
            autoComplete="off"
          />
        </form>

        <section className="safari-start-section">
          <h2>Favorites</h2>
          <div className="safari-tiles">
            {FAVORITES.map((f) => (
              <Tile key={f.url} url={f.url} title={f.title} nav={nav} />
            ))}
          </div>
        </section>

        {frequent.length > 0 && (
          <section className="safari-start-section">
            <h2>Frequently Visited</h2>
            <div className="safari-tiles">
              {frequent.map((f) => (
                <Tile key={f.url} url={f.url} title={f.title || displayHost(f.url)} nav={nav} />
              ))}
            </div>
          </section>
        )}

        <p className="safari-start-note">
          Many websites refuse to be shown inside another page. When that happens Safari offers to open them in a
          real browser tab instead. <a {...linkProps("sherlock://about", nav)}>How this browser works</a>
        </p>
      </div>
    </div>
  );
}

const Row = memo(function Row({ item, nav, meta, onRemove, removeLabel }) {
  return (
    <div className="safari-row">
      <a className="safari-row-link" {...linkProps(item.url, nav)} draggable={false}>
        <Favicon url={item.url} size={16} />
        <span className="safari-row-title">{item.title || displayHost(item.url)}</span>
        <span className="safari-row-url">{displayHost(item.url) || item.url}</span>
        {meta && <span className="safari-row-meta">{meta}</span>}
      </a>
      <button type="button" className="safari-row-remove" aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
        <LuX size={13} />
      </button>
    </div>
  );
});

function PageHeader(props) {
  const { icon: Icon, title, q, setQ, children } = props;
  return (
    <header className="safari-list-head">
      <h1>
        <Icon size={20} /> {title}
      </h1>
      <div className="safari-list-tools">
        <label className="safari-search-field">
          <LuSearch size={13} aria-hidden="true" />
          <input
            className="os-selectable"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label={`Search ${title.toLowerCase()}`}
            spellCheck={false}
          />
        </label>
        {children}
      </div>
    </header>
  );
}

function HistoryPage({ nav }) {
  const history = useSafari((s) => s.history);
  const [q, setQ] = useState("");
  const groups = useMemo(() => groupByDay(filterItems(history, q)), [history, q]);
  return (
    <div className="safari-page safari-list-page os-scroll">
      <div className="safari-list-inner">
        <PageHeader icon={LuClock} title="History" q={q} setQ={setQ}>
          <button type="button" className="os-btn" disabled={!history.length} onClick={() => safari.clearHistory()}>
            <LuTrash2 size={13} /> Clear History
          </button>
        </PageHeader>
        {groups.length === 0 && (
          <p className="safari-empty">{q ? `No history matches “${q}”.` : "Pages you visit will be listed here."}</p>
        )}
        {groups.map((g) => (
          <section key={g.key} className="safari-list-group">
            <h2>{g.label}</h2>
            {g.items.map((h) => (
              <Row
                key={`${h.time}|${h.url}`}
                item={h}
                nav={nav}
                meta={timeOf(h.time)}
                removeLabel="Remove from history"
                onRemove={() => safari.removeHistory(h.time)}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function BookmarksPage({ nav }) {
  const bookmarks = useSafari((s) => s.bookmarks);
  const [q, setQ] = useState("");
  const list = useMemo(() => filterItems(bookmarks, q), [bookmarks, q]);
  return (
    <div className="safari-page safari-list-page os-scroll">
      <div className="safari-list-inner">
        <PageHeader icon={LuBookmark} title="Bookmarks" q={q} setQ={setQ} />
        {list.length === 0 && (
          <p className="safari-empty">
            {q ? `No bookmarks match “${q}”.` : "Click the star in the address bar to bookmark a page."}
          </p>
        )}
        <section className="safari-list-group">
          {list.map((b) => (
            <Row
              key={b.url}
              item={b}
              nav={nav}
              removeLabel="Remove bookmark"
              onRemove={() => safari.removeBookmark(b.url)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

const SHORTCUTS = [
  ["Ctrl L  /  Alt D", "Focus the address bar"],
  ["Alt T", "New tab"],
  ["Alt W", "Close tab"],
  ["Alt ←  /  Alt →", "Back / Forward"],
  ["Alt R", "Reload page"],
  ["Alt 1 … 9", "Switch to tab"],
  ["Middle-click", "Close a tab, or open a link in a new tab"],
];

function AboutPage({ nav }) {
  const tabs = useSafari((s) => s.tabs.length);
  const history = useSafari((s) => s.history.length);
  const bookmarks = useSafari((s) => s.bookmarks.length);
  return (
    <div className="safari-page safari-about os-scroll">
      <div className="safari-about-inner">
        <img src={safariIcon} alt="" className="safari-about-icon" width={96} height={96} decoding="async" />
        <h1>Safari</h1>
        <p className="safari-about-sub">The web browser of SherlockOS</p>
        <div className="safari-about-stats">
          <span><b>{tabs}</b> open {tabs === 1 ? "tab" : "tabs"}</span>
          <span><b>{history}</b> history {history === 1 ? "item" : "items"}</span>
          <span><b>{bookmarks}</b> {bookmarks === 1 ? "bookmark" : "bookmarks"}</span>
        </div>

        <section>
          <h2>How it works</h2>
          <p>
            SherlockOS runs inside a web page, so every website you open here is shown in an embedded frame. Many sites
            (GitHub, LinkedIn, Stack Overflow, YouTube pages…) send headers that forbid this. Safari knows the common ones
            and offers to open them in a real browser tab; sites it hasn't seen before are loaded and may come up blank.
          </p>
          <p>
            A few sites get special treatment: YouTube and Spotify links switch to their official embed players, and
            GitHub profiles and repositories open as a native page built from GitHub's public API.
          </p>
          <p>
            Tabs, history and bookmarks are stored only in this browser's local storage. Searches go to Google.
          </p>
        </section>

        <section>
          <h2>Keyboard shortcuts</h2>
          <dl className="safari-about-keys">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt><kbd>{k}</kbd></dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="safari-about-links">
          <a className="os-btn" {...linkProps("sherlock://history", nav)}>History</a>
          <a className="os-btn" {...linkProps("sherlock://bookmarks", nav)}>Bookmarks</a>
          <a className="os-btn" {...linkProps(START, nav)}>Start Page</a>
        </div>
      </div>
    </div>
  );
}

const ERRORS = {
  invalid: (u) => ["Safari Can't Open the Page", `“${u}” is not a valid web address.`],
  scheme: (u) => [
    "Safari Can't Open the Page",
    `SherlockOS doesn't know how to open addresses like “${u}”. Only web pages (http and https) can be shown here.`,
  ],
  notfound: (u) => ["Page Not Found", `There is no internal page called “${u}”.`],
};

function ErrorPage({ url, info, nav }) {
  const reason = info.page === "error" ? info.params.get("reason") || "invalid" : "notfound";
  const target = info.page === "error" ? info.params.get("url") || "" : url;
  const [title, body] = (ERRORS[reason] || ERRORS.invalid)(target);
  return (
    <div className="safari-page safari-message os-scroll">
      <LuTriangleAlert size={44} className="safari-message-icon" />
      <h1>{title}</h1>
      <p className="os-selectable">{body}</p>
      <div className="safari-message-actions">
        <button type="button" className="os-btn" onClick={() => nav(START)}>
          Go to Start Page
        </button>
      </div>
    </div>
  );
}

export function InternalPage({ url, info, nav }) {
  if (info.kind !== "internal") return <ErrorPage url={url} info={classify("sherlock://error?reason=scheme")} nav={nav} />;
  switch (info.page) {
    case "start":
      return <StartPage nav={nav} />;
    case "history":
      return <HistoryPage nav={nav} />;
    case "bookmarks":
      return <BookmarksPage nav={nav} />;
    case "about":
      return <AboutPage nav={nav} />;
    default:
      return <ErrorPage url={url} info={info} nav={nav} />;
  }
}
