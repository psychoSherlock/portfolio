// Small shared helpers for the Safari UI (kept out of .jsx files for fast refresh).
import { LuBookmark, LuExternalLink } from "react-icons/lu";
import { openExternal } from "../../os/open";
import { ui } from "../../os/ui";
import { safari } from "./store";
import { externalUrl, guessTitle, parseUrl, stripWww } from "./urls";

/** Click handler props for anything that behaves like a link (Cmd/Ctrl/middle-click -> background tab). */
export function linkProps(url, nav) {
  return {
    href: url,
    onClick(e) {
      e.preventDefault();
      nav(url, { newTab: e.metaKey || e.ctrlKey, background: e.metaKey || e.ctrlKey });
    },
    onAuxClick(e) {
      if (e.button !== 1) return;
      e.preventDefault();
      nav(url, { newTab: true, background: true });
    },
    onContextMenu(e) {
      e.preventDefault();
      e.stopPropagation();
      const ext = externalUrl(url);
      ui.showContextMenu(e.clientX, e.clientY, [
        { label: "Open Link", onClick: () => nav(url) },
        { label: "Open Link in New Tab", onClick: () => nav(url, { newTab: true }) },
        ext && { label: "Open in Real Browser Tab", icon: LuExternalLink, onClick: () => openExternal(ext) },
        { separator: true },
        { label: "Copy Link", onClick: () => navigator.clipboard?.writeText(ext || url).catch(() => {}) },
        {
          label: safari.bookmarks.some((b) => b.url === url) ? "Remove Bookmark" : "Add Bookmark",
          icon: LuBookmark,
          onClick: () => safari.toggleBookmark(url, guessTitle(url)),
        },
      ]);
    },
  };
}

export const isSearchUrl = (url) => {
  const u = parseUrl(url);
  if (!u) return false;
  const h = stripWww(u.hostname);
  return (h === "google.com" || h === "bing.com") && u.pathname === "/search";
};

// ---- history ----------------------------------------------------------------
const dayKey = (t) => new Date(t).toDateString();
function dayLabel(t) {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
export const timeOf = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function filterItems(items, q) {
  const s = q.trim().toLowerCase();
  if (!s) return items;
  return items.filter((i) => i.url.toLowerCase().includes(s) || (i.title || "").toLowerCase().includes(s));
}

export function groupByDay(items) {
  const groups = [];
  let cur = null;
  for (const h of items) {
    const k = dayKey(h.time);
    if (!cur || cur.key !== k) groups.push((cur = { key: k, label: dayLabel(h.time), items: [] }));
    cur.items.push(h);
  }
  return groups;
}


const RTF = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
const UNITS = [
  ["year", 31536e6],
  ["month", 2592e6],
  ["week", 6048e5],
  ["day", 864e5],
  ["hour", 36e5],
  ["minute", 6e4],
];
/** "3 days ago" style relative time for an ISO date string. */
export function relTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = t - Date.now();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "minute") {
      const v = Math.round(diff / ms);
      return RTF ? RTF.format(v, unit) : new Date(t).toLocaleDateString();
    }
  }
  return "";
}

export const compact = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n ?? 0);
