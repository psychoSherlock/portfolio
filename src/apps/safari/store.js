// Browser state: tabs (each with its own back/forward stack), bookmarks, history.
// Module-level so it survives the window being closed; persisted to localStorage.
import { create } from "zustand";
import { openExternal } from "../../os/open";
import { START, classify, guessTitle, resolveInput } from "./urls";

const KEY = "sherlockos.safari.v1";
const MAX_HISTORY = 400;
const MAX_ENTRIES = 50;

let seq = 0;
const newId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

const makeTab = (url = START) => ({
  id: newId(),
  entries: [{ url, title: guessTitle(url) }],
  index: 0,
  // transient (never persisted):
  loading: false,
  reloadKey: 0,
  override: null, // { url, mode: "force" | "block", reason? }
});

const DEFAULT_BOOKMARKS = [
  { url: "https://psychosherlock.github.io/", title: "psychoSherlock — Portfolio" },
  { url: "sherlock://github", title: "GitHub — psychoSherlock" },
  { url: "https://en.wikipedia.org/wiki/Capture_the_flag_(cybersecurity)", title: "Capture the flag (cybersecurity) - Wikipedia" },
  { url: "https://gtfobins.github.io/", title: "GTFOBins" },
  { url: "https://gchq.github.io/CyberChef/", title: "CyberChef" },
  { url: "https://cheatsheetseries.owasp.org/", title: "OWASP Cheat Sheet Series" },
];

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || !Array.isArray(raw.tabs)) return null;
    const tabs = raw.tabs
      .filter((t) => t && Array.isArray(t.entries) && t.entries.length)
      .map((t) => {
        const entries = t.entries
          .filter((e) => e && typeof e.url === "string")
          .map((e) => ({ url: e.url, title: String(e.title || guessTitle(e.url)) }));
        if (!entries.length) return null;
        return { ...makeTab(), entries, index: Math.min(Math.max(0, t.index | 0), entries.length - 1) };
      })
      .filter(Boolean);
    if (!tabs.length) return null;
    return {
      tabs,
      activeId: tabs[Math.min(Math.max(0, raw.active | 0), tabs.length - 1)].id,
      bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks.filter((b) => b && typeof b.url === "string") : DEFAULT_BOOKMARKS,
      history: Array.isArray(raw.history) ? raw.history.filter((h) => h && typeof h.url === "string") : [],
      sidebarOpen: !!raw.sidebarOpen,
      sidebarTab: raw.sidebarTab === "history" ? "history" : "bookmarks",
    };
  } catch {
    return null;
  }
}

const first = makeTab();
const initial = load() || {
  tabs: [first],
  activeId: first.id,
  bookmarks: DEFAULT_BOOKMARKS,
  history: [],
  sidebarOpen: false,
  sidebarTab: "bookmarks",
};

export const currentEntry = (tab) => tab.entries[tab.index];
const skipHistory = (url) => {
  const c = classify(url);
  return c.kind === "internal" && c.page !== "github";
};

const patchTab = (s, id, fn) => ({ tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)) });

export const useSafari = create((set, get) => ({
  ...initial,

  // ---- tabs ---------------------------------------------------------------
  /** Open a tab (focused). Reuses the active tab when it is an untouched start page. */
  newTab(input, { background = false } = {}) {
    const s = get();
    const url = input ? resolveInput(input) : START;
    if (classify(url).kind === "external") return openExternal(url), s.activeId;
    const active = s.tabs.find((t) => t.id === s.activeId);
    if (input && !background && active && active.entries.length === 1 && active.entries[0].url === START) {
      get().navigate(active.id, url);
      return active.id;
    }
    const tab = makeTab(url);
    const at = s.tabs.findIndex((t) => t.id === s.activeId);
    const tabs = [...s.tabs];
    tabs.splice(input && at >= 0 ? at + 1 : tabs.length, 0, tab);
    set({ tabs, activeId: background ? s.activeId : tab.id });
    get().record(url, tab.entries[0].title);
    return tab.id;
  },

  /** Returns false when the last tab was closed (the caller closes the window). */
  closeTab(id) {
    const s = get();
    const i = s.tabs.findIndex((t) => t.id === id);
    if (i < 0) return true;
    if (s.tabs.length === 1) {
      const tab = makeTab();
      set({ tabs: [tab], activeId: tab.id });
      return false;
    }
    const tabs = s.tabs.filter((t) => t.id !== id);
    set({ tabs, activeId: s.activeId === id ? tabs[Math.min(i, tabs.length - 1)].id : s.activeId });
    return true;
  },

  closeOthers(id) {
    set((s) => ({ tabs: s.tabs.filter((t) => t.id === id), activeId: id }));
  },

  duplicateTab(id) {
    const s = get();
    const i = s.tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    const src = s.tabs[i];
    const tab = { ...makeTab(), entries: src.entries.map((e) => ({ ...e })), index: src.index };
    const tabs = [...s.tabs];
    tabs.splice(i + 1, 0, tab);
    set({ tabs, activeId: tab.id });
  },

  activate(id) {
    if (get().activeId !== id) set({ activeId: id });
  },

  cycleTab(dir) {
    const s = get();
    const i = s.tabs.findIndex((t) => t.id === s.activeId);
    set({ activeId: s.tabs[(i + dir + s.tabs.length) % s.tabs.length].id });
  },

  reorder(ids) {
    set((s) => {
      const byId = new Map(s.tabs.map((t) => [t.id, t]));
      const tabs = ids.map((id) => byId.get(id)).filter(Boolean);
      return tabs.length === s.tabs.length ? { tabs } : {};
    });
  },

  // ---- navigation ---------------------------------------------------------
  navigate(id, input, engine) {
    const url = resolveInput(input, engine);
    if (classify(url).kind === "external") return void openExternal(url);
    const title = guessTitle(url);
    set((s) =>
      patchTab(s, id, (t) => {
        if (currentEntry(t).url === url) return { ...t, reloadKey: t.reloadKey + 1, override: null };
        const entries = [...t.entries.slice(0, t.index + 1), { url, title }].slice(-MAX_ENTRIES);
        return { ...t, entries, index: entries.length - 1, override: null, loading: false };
      })
    );
    get().record(url, title);
  },

  go(id, delta) {
    set((s) =>
      patchTab(s, id, (t) => {
        const index = t.index + delta;
        if (index < 0 || index >= t.entries.length) return t;
        return { ...t, index, override: null, loading: false };
      })
    );
    const tab = get().tabs.find((t) => t.id === id);
    if (tab) get().record(currentEntry(tab).url, currentEntry(tab).title);
  },

  reload(id) {
    set((s) => patchTab(s, id, (t) => ({ ...t, reloadKey: t.reloadKey + 1 })));
  },

  setLoading(id, loading) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.loading === loading) return;
    set((s) => patchTab(s, id, (t) => ({ ...t, loading })));
  },

  /** mode: "force" (frame it anyway) | "block" (show the interstitial) | null */
  setOverride(id, mode, reason) {
    set((s) =>
      patchTab(s, id, (t) => ({
        ...t,
        loading: false,
        reloadKey: t.reloadKey + (mode === "force" ? 1 : 0),
        override: mode ? { url: currentEntry(t).url, mode, reason } : null,
      }))
    );
  },

  /** Internal pages report their real title once they know it. */
  setTitle(id, url, title) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || !tab.entries.some((e) => e.url === url && e.title !== title)) return;
    set((s) => ({
      ...patchTab(s, id, (t) => ({
        ...t,
        entries: t.entries.map((e) => (e.url === url ? { ...e, title } : e)),
      })),
      history: s.history.map((h) => (h.url === url ? { ...h, title } : h)),
    }));
  },

  // ---- history ------------------------------------------------------------
  record(url, title) {
    if (skipHistory(url)) return;
    set((s) => {
      const now = Date.now();
      const rest = s.history[0]?.url === url ? s.history.slice(1) : s.history;
      return { history: [{ url, title, time: now }, ...rest].slice(0, MAX_HISTORY) };
    });
  },
  removeHistory(time) {
    set((s) => ({ history: s.history.filter((h) => h.time !== time) }));
  },
  clearHistory() {
    set({ history: [] });
  },

  // ---- bookmarks ----------------------------------------------------------
  toggleBookmark(url, title) {
    set((s) => ({
      bookmarks: s.bookmarks.some((b) => b.url === url)
        ? s.bookmarks.filter((b) => b.url !== url)
        : [...s.bookmarks, { url, title: title || guessTitle(url) }],
    }));
  },
  addBookmark(url, title) {
    if (!get().bookmarks.some((b) => b.url === url)) get().toggleBookmark(url, title);
  },
  removeBookmark(url) {
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.url !== url) }));
  },

  // ---- sidebar ------------------------------------------------------------
  toggleSidebar() {
    set((s) => ({ sidebarOpen: !s.sidebarOpen }));
  },
  setSidebarTab(sidebarTab) {
    set({ sidebarTab });
  },
}));

export const safari = new Proxy({}, { get: (_, key) => useSafari.getState()[key] });

// ---- persistence (debounced; transient per-tab fields are dropped) ---------
let saveTimer = 0;
let lastSaved = null;
const snapshot = (s) => ({
  tabs: s.tabs.map((t) => ({ entries: t.entries, index: t.index })),
  active: Math.max(0, s.tabs.findIndex((t) => t.id === s.activeId)),
  bookmarks: s.bookmarks,
  history: s.history,
  sidebarOpen: s.sidebarOpen,
  sidebarTab: s.sidebarTab,
});
useSafari.subscribe((s) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const json = JSON.stringify(snapshot(s));
      if (json === lastSaved) return;
      lastSaved = json;
      localStorage.setItem(KEY, json);
    } catch {
      /* storage full or unavailable — the session still works in memory */
    }
  }, 400);
});
