// URL helpers: address-bar parsing, classification, titles, favicons.
import { githubToInternal, searchUrl } from "./embeddable";

export const START = "sherlock://start";
export const GITHUB_USER = "psychoSherlock";

export const INTERNAL_PAGES = [
  { url: START, title: "Start Page" },
  { url: "sherlock://github", title: "GitHub — psychoSherlock" },
  { url: "sherlock://history", title: "History" },
  { url: "sherlock://bookmarks", title: "Bookmarks" },
  { url: "sherlock://about", title: "About This Browser" },
];

export const FAVORITES = [
  { title: "Portfolio", url: "https://psychosherlock.github.io/" },
  { title: "GitHub", url: "sherlock://github" },
  { title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page" },
  { title: "Hack The Box", url: "https://www.hackthebox.com/" },
  { title: "TryHackMe", url: "https://tryhackme.com/" },
  { title: "CTFtime", url: "https://ctftime.org/" },
  { title: "Web Security Academy", url: "https://portswigger.net/web-security" },
  { title: "OWASP", url: "https://owasp.org/" },
  { title: "Kali Tools", url: "https://www.kali.org/tools/" },
  { title: "Exploit-DB", url: "https://www.exploit-db.com/" },
  { title: "GTFOBins", url: "https://gtfobins.github.io/" },
  { title: "CyberChef", url: "https://gchq.github.io/CyberChef/" },
];

const SITE_NAMES = {
  "psychosherlock.github.io": "psychoSherlock",
  "wikipedia.org": "Wikipedia",
  "google.com": "Google",
  "bing.com": "Bing",
  "github.com": "GitHub",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "open.spotify.com": "Spotify",
  "hackthebox.com": "Hack The Box",
  "tryhackme.com": "TryHackMe",
  "ctftime.org": "CTFtime",
  "portswigger.net": "PortSwigger",
  "owasp.org": "OWASP",
  "kali.org": "Kali Linux",
  "exploit-db.com": "Exploit Database",
  "gtfobins.github.io": "GTFOBins",
  "gchq.github.io": "CyberChef",
  "linkedin.com": "LinkedIn",
  "x.com": "X",
  "twitter.com": "X",
  "instagram.com": "Instagram",
  "archive.org": "Internet Archive",
  "openstreetmap.org": "OpenStreetMap",
  "example.com": "Example Domain",
};

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const HOSTLIKE_RE = /^(localhost|(\d{1,3}\.){3}\d{1,3}|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?([/?#].*)?$/i;

export const stripWww = (host) => host.replace(/^www\./, "");

export function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Turn whatever was typed into a canonical URL.
 * full URL -> itself; domain.tld[/path] -> https://…; anything else -> web search.
 */
export function resolveInput(raw, engine) {
  const text = String(raw ?? "").trim();
  if (!text) return START;
  if (/^sherlock:/i.test(text)) return normalizeInternal(text);
  if (/^about:(blank|home|newtab)$/i.test(text)) return START;
  if (/^https?:\/\//i.test(text)) {
    const u = parseUrl(text);
    if (!u) return `sherlock://error?reason=invalid&url=${encodeURIComponent(text)}`;
    return githubToInternal(u.href) || u.href;
  }
  if (SCHEME_RE.test(text) && !/\s/.test(text) && !/^[^\s/]+:\d/.test(text)) {
    if (/^(mailto|tel):/i.test(text)) return text;
    return `sherlock://error?reason=scheme&url=${encodeURIComponent(text)}`;
  }
  if (!/\s/.test(text) && HOSTLIKE_RE.test(text)) {
    const scheme = /^(localhost|(\d{1,3}\.){3}\d{1,3})(:|\/|$)/i.test(text) ? "http" : "https";
    const u = parseUrl(`${scheme}://${text}`);
    if (u) return githubToInternal(u.href) || u.href;
  }
  return searchUrl(text, engine);
}

function normalizeInternal(text) {
  const rest = text.replace(/^sherlock:\/*/i, "").replace(/\/+$/, "");
  if (!rest) return START;
  const [page, ...args] = rest.split("/");
  return `sherlock://${page.toLowerCase()}${args.length ? "/" + args.join("/") : ""}`;
}

/** -> { kind: "internal", page, args, params } | { kind: "web", url, host } | { kind: "external", url } */
export function classify(url) {
  if (url.startsWith("sherlock://")) {
    const [path, query = ""] = url.slice("sherlock://".length).split("?");
    const [page, ...args] = path.split("/").filter(Boolean);
    return { kind: "internal", page: page || "start", args, params: new URLSearchParams(query) };
  }
  if (/^(mailto|tel):/i.test(url)) return { kind: "external", url };
  const u = parseUrl(url);
  if (!u) return { kind: "internal", page: "error", args: [], params: new URLSearchParams({ reason: "invalid", url }) };
  return { kind: "web", url: u.href, host: u.hostname };
}

/** The URL a real browser should open for this page. */
export function externalUrl(url) {
  const c = classify(url);
  if (c.kind !== "internal") return url;
  if (c.page === "github") return `https://github.com/${c.args.length ? c.args.join("/") : GITHUB_USER}`;
  if (c.page === "error") return c.params.get("url") || null;
  return null;
}

/** Short text for the blurred address field. */
export function displayHost(url) {
  const c = classify(url);
  if (c.kind === "internal") {
    if (c.page === "start") return "";
    if (c.page === "github") return `github.com/${c.args.length ? c.args.join("/") : GITHUB_USER}`;
    if (c.page === "error") return parseUrl(c.params.get("url") || "")?.hostname || "Page not available";
    return `sherlock://${c.page}`;
  }
  if (c.kind === "web") return stripWww(c.host);
  return url;
}

/** Text placed in the focused address field. */
export const editableUrl = (url) => {
  if (url === START) return "";
  const c = classify(url);
  if (c.kind === "internal" && c.page === "error") return c.params.get("url") || "";
  return url;
};

export const isSecure = (url) => url.startsWith("https://") || url.startsWith("sherlock://");

export function faviconUrl(url, size = 64) {
  const c = classify(url);
  let host = c.kind === "web" ? c.host : null;
  if (c.kind === "internal" && c.page === "github") host = "github.com";
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

const pretty = (s) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
};

/** Best-effort page title (a cross-origin frame's real <title> cannot be read). */
export function guessTitle(url) {
  const c = classify(url);
  if (c.kind === "internal") {
    switch (c.page) {
      case "start": return "Start Page";
      case "history": return "History";
      case "bookmarks": return "Bookmarks";
      case "about": return "About This Browser";
      case "github": return c.args.length ? c.args.join("/") : GITHUB_USER;
      case "error": return "Page Not Available";
      default: return "Page Not Found";
    }
  }
  if (c.kind !== "web") return url;
  const u = parseUrl(url);
  const host = stripWww(u.hostname);
  const q = u.searchParams.get("q") || u.searchParams.get("search");
  if (q && /(^|\.)google\.[a-z.]+$/.test(host)) return `${q} - Google Search`;
  if (q && host === "bing.com") return `${q} - Bing`;
  if (host.endsWith("wikipedia.org")) {
    if (q) return `${q} - Search - Wikipedia`;
    const m = u.pathname.match(/^\/wiki\/(.+)$/);
    if (m && m[1] !== "Main_Page") return `${pretty(m[1]).replace(/_/g, " ")} - Wikipedia`;
    return "Wikipedia";
  }
  for (const key of Object.keys(SITE_NAMES)) {
    if (host === key || host.endsWith("." + key)) return SITE_NAMES[key];
  }
  return host;
}

export const siteName = (host) => {
  const h = stripWww(host);
  for (const key of Object.keys(SITE_NAMES)) {
    if (h === key || h.endsWith("." + key)) return SITE_NAMES[key];
  }
  return h;
};
