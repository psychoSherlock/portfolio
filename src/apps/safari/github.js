// Tiny GitHub REST client for the native sherlock://github pages.
// Unauthenticated (60 requests/hour per visitor), so every success is cached in
// sessionStorage and failures are classified so the page can offer github.com instead.
import DOMPurify from "dompurify";

const API = "https://api.github.com";
const TTL = 15 * 60 * 1000;
const PREFIX = "sherlockos.safari.gh:";

export class GitHubError extends Error {
  constructor(kind, message, reset) {
    super(message);
    this.kind = kind; // "rate" | "notfound" | "network" | "http"
    this.reset = reset || null; // Date when the rate limit resets
  }
}

const memory = new Map();

function readCache(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = JSON.parse(sessionStorage.getItem(PREFIX + key) || "null");
    if (raw && Date.now() - raw.t < TTL) {
      memory.set(key, raw.v);
      return raw.v;
    }
  } catch {
    /* unavailable or corrupt */
  }
  return undefined;
}

function writeCache(key, v) {
  memory.set(key, v);
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* quota — the in-memory copy is enough */
  }
}

const inflight = new Map();

async function request(path, { html = false, optional = false } = {}) {
  const key = (html ? "html:" : "json:") + path;
  const hit = readCache(key);
  if (hit !== undefined) return hit;
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    let res;
    try {
      res = await fetch(API + path, {
        headers: { Accept: html ? "application/vnd.github.html+json" : "application/vnd.github+json" },
      });
    } catch {
      throw new GitHubError("network", "GitHub could not be reached.");
    }
    if (res.status === 404) {
      if (optional) {
        writeCache(key, null);
        return null;
      }
      throw new GitHubError("notfound", "Not found on GitHub.");
    }
    if (res.status === 403 || res.status === 429) {
      const left = res.headers.get("x-ratelimit-remaining");
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      if (left === "0" || res.status === 429) {
        throw new GitHubError("rate", "GitHub's API rate limit was reached.", reset ? new Date(reset * 1000) : null);
      }
    }
    if (!res.ok) throw new GitHubError("http", `GitHub answered ${res.status}.`);
    const data = html ? await res.text() : await res.json();
    writeCache(key, data);
    return data;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

const enc = encodeURIComponent;

export const getUser = (user) => request(`/users/${enc(user)}`);
export const getRepos = (user) => request(`/users/${enc(user)}/repos?sort=updated&per_page=100`);
export const getRepo = (user, repo) => request(`/repos/${enc(user)}/${enc(repo)}`);
export const getLanguages = (user, repo) => request(`/repos/${enc(user)}/${enc(repo)}/languages`, { optional: true });
export const getReadme = (user, repo) => request(`/repos/${enc(user)}/${enc(repo)}/readme`, { html: true, optional: true });

/** Synchronous cache peek so revisits render instantly without a spinner. */
export const peek = (path, html = false) => readCache((html ? "html:" : "json:") + path);
export const peekUser = (user) => peek(`/users/${enc(user)}`);
export const peekRepos = (user) => peek(`/users/${enc(user)}/repos?sort=updated&per_page=100`);
export const peekRepo = (user, repo) => peek(`/repos/${enc(user)}/${enc(repo)}`);

const isAbsolute = (u) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u);

/**
 * Sanitize README HTML and make its relative links/images point at the repository.
 * Returns an HTML string safe to inject.
 */
export function prepareReadme(html, user, repo, branch = "HEAD") {
  const frag = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
    FORBID_ATTR: ["style"],
  });
  const raw = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/`;
  const blob = `https://github.com/${user}/${repo}/blob/${branch}/`;
  frag.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (src && !isAbsolute(src) && !src.startsWith("data:")) {
      img.setAttribute("src", new URL(src.replace(/^\.?\//, ""), raw).href);
    }
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    img.setAttribute("referrerpolicy", "no-referrer");
  });
  frag.querySelectorAll("source[srcset]").forEach((s) => {
    const set = s.getAttribute("srcset") || "";
    if (set && !isAbsolute(set)) s.setAttribute("srcset", new URL(set.replace(/^\.?\//, ""), raw).href);
  });
  frag.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#")) return;
    if (!isAbsolute(href)) {
      a.setAttribute("href", href.startsWith("/") ? `https://github.com${href}` : new URL(href.replace(/^\.\//, ""), blob).href);
    }
    a.setAttribute("rel", "noopener noreferrer");
  });
  const div = document.createElement("div");
  div.appendChild(frag);
  return div.innerHTML;
}

/** GitHub linguist colours for the languages that show up most. */
export const LANG_COLORS = {
  Python: "#3572A5",
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  HTML: "#e34c26",
  CSS: "#663399",
  SCSS: "#c6538c",
  Shell: "#89e051",
  PowerShell: "#012456",
  Batchfile: "#C1F12E",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  Dart: "#00B4AB",
  PHP: "#4F5D95",
  Ruby: "#701516",
  Lua: "#000080",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  "Jupyter Notebook": "#DA5B0B",
  Dockerfile: "#384d54",
  Makefile: "#427819",
  Assembly: "#6E4C13",
  Perl: "#0298c3",
  Solidity: "#AA6746",
  Nix: "#7e7eff",
  Hack: "#878787",
};
export const langColor = (lang) => LANG_COLORS[lang] || "#8b8b8b";
