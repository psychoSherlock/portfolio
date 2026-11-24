// Which sites can be shown inside an <iframe>, and how to rewrite the ones that
// offer a dedicated embeddable URL.
//
// A site forbids framing with `X-Frame-Options` or `Content-Security-Policy:
// frame-ancestors`, and the embedding page cannot observe that from JS. So this is
// a hand-checked table. Verified with `curl -sI -L` on 2026-11-17 and re-verified with
// `curl -sL -D -` on 2026-11-24 (response headers only; a host without either header is "allow").
//
// Search engines, same check (2026-11-24):
//   https://www.google.com/webhp?igu=1          200, no XFO / frame-ancestors  -> works framed
//   https://www.google.com/search?igu=1&q=…     200, no XFO / frame-ancestors  -> works framed (default)
//   https://www.google.com/search?q=…           X-Frame-Options: SAMEORIGIN    -> blocked without igu=1
//   https://www.bing.com/search?q=…             200, no XFO / frame-ancestors  -> works framed (fallback)
//   https://www.bing.com/                       X-Frame-Options: SAMEORIGIN    -> blocked
//   https://duckduckgo.com/, html.duckduckgo.com/html, lite.duckduckgo.com/lite
//                                               XFO SAMEORIGIN + frame-ancestors 'self' -> blocked
//   search.brave.com, startpage.com, ecosia.org frame-ancestors 'self' / XFO   -> blocked
//
// Notable 2026-11-24 changes: *.wikipedia.org / *.wikimedia.org now send
// `frame-ancestors 'self' *.wikipedia.org … localhost` (frames only on localhost, so it
// looks fine in dev and breaks on github.io) -> moved to DENY. www.exploit-db.com could
// not be checked (TLS chain rejected by curl) -> left "unknown".

/** Hosts (and all their subdomains) that sent no anti-framing header. */
const ALLOW = [
  "psychosherlock.github.io",
  "github.io", // GitHub Pages never adds framing headers (gtfobins, lolbas, CyberChef, PayloadsAllTheThings…)
  "gitlab.io",
  "pages.github.com",
  "www.wikipedia.org", // the portal page only; articles are denied below
  "wiktionary.org",
  "archive.org",
  "example.com",
  "hackthebox.com",
  "academy.hackthebox.com",
  "tryhackme.com",
  "cheatsheetseries.owasp.org",
  "attack.mitre.org",
  "picoctf.org",
  "overthewire.org",
  "pwn.college",
  "bugcrowd.com",
  "hacker101.com",
  "revshells.com",
  "cyberchef.org",
  "ippsec.rocks",
  "explainshell.com",
  "man7.org",
  "wiki.archlinux.org",
  "docs.python.org",
  "nodejs.org",
  "react.dev",
  "vite.dev",
  "tailwindcss.com",
  "rust-lang.org",
  "typescriptlang.org",
  "kubernetes.io",
  "devdocs.io",
  "tldr.sh",
  "tldr.inbrowser.app",
  "jwt.io",
  "excalidraw.com",
  "desmos.com",
  "wttr.in",
  "httpbin.org",
  "info.cern.ch",
  "nginx.org",
  "sqlite.org",
  "rfc-editor.org",
  "nmap.org",
  "openwall.com",
  "krebsonsecurity.com",
  "thehackernews.com",
  "schneier.com",
  "lobste.rs",
  "xkcd.com",
  "codesandbox.io",
  "microsoft.com",
  "hn.algolia.com",
  "player.vimeo.com",
  "youtube-nocookie.com",
];

/** Hosts that answered with X-Frame-Options DENY/SAMEORIGIN or frame-ancestors 'none'/'self'. */
const DENY = [
  "wikipedia.org",
  "wikimedia.org",
  "github.com",
  "gist.github.com",
  "docs.github.com",
  "githubusercontent.com",
  "gitlab.com",
  "x.com",
  "twitter.com",
  "t.co",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "facebook.com",
  "threads.net",
  "whatsapp.com",
  "telegram.org",
  "t.me",
  "stackoverflow.com",
  "stackexchange.com",
  "reddit.com",
  "medium.com",
  "quora.com",
  "pinterest.com",
  "tiktok.com",
  "twitch.tv",
  "discord.com",
  "netflix.com",
  "amazon.com",
  "apple.com",
  "paypal.com",
  "bbc.com",
  "nytimes.com",
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "startpage.com",
  "search.brave.com",
  "ecosia.org",
  "chatgpt.com",
  "claude.ai",
  "notion.so",
  "figma.com",
  "vercel.com",
  "cloudflare.com",
  "codepen.io",
  "stackblitz.com",
  "npmjs.com",
  "pypi.org",
  "developer.mozilla.org",
  "mozilla.org",
  "docs.docker.com",
  "go.dev",
  "python.org",
  "php.net",
  "debian.org",
  "gnu.org",
  "kernel.org",
  "archlinux.org",
  "ubuntu.com",
  "linuxfoundation.org",
  "w3.org",
  "w3schools.com",
  "geeksforgeeks.org",
  "freecodecamp.org",
  "css-tricks.com",
  "dev.to",
  "ietf.org",
  "news.ycombinator.com",
  "lwn.net",
  "phoronix.com",
  "slashdot.org",
  "bleepingcomputer.com",
  "zerodayinitiative.com",
  "ctftime.org",
  "portswigger.net",
  "owasp.org",
  "kali.org",
  "app.hackthebox.com",
  "book.hacktricks.wiki",
  "crackstation.net",
  "cryptohack.org",
  "root-me.org",
  "vulnhub.com",
  "hackerone.com",
  "offsec.com",
  "metasploit.com",
  "wireshark.org",
  "hashcat.net",
  "ghidra-sre.org",
  "nvd.nist.gov",
  "cve.org",
  "shodan.io",
  "virustotal.com",
  "regex101.com",
  "speedtest.net",
  "soundcloud.com",
  "vimeo.com",
  "bsky.app",
  "mastodon.social",
  "wolframalpha.com",
  "openstreetmap.org",
  "spotify.com",
  "neal.fun",
];

export const SEARCH_ENGINES = {
  google: { name: "Google", url: (q) => `https://www.google.com/search?igu=1&q=${encodeURIComponent(q)}` },
  bing: { name: "Bing", url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
};
export const searchUrl = (q, engine = "google") => (SEARCH_ENGINES[engine] || SEARCH_ENGINES.google).url(q);

const matchLen = (host, list) => {
  let best = 0;
  for (const d of list) {
    if ((host === d || host.endsWith("." + d)) && d.length > best) best = d.length;
  }
  return best;
};

/** Longest-suffix match across both lists: "allow" | "deny" | "unknown". */
function hostPolicy(host) {
  const a = matchLen(host, ALLOW);
  const d = matchLen(host, DENY);
  if (!a && !d) return "unknown";
  return a >= d ? "allow" : "deny";
}

const bare = (host) => host.replace(/^(www|m|mobile)\./, "");

/** Sites that only allow framing through a dedicated embed URL. Returns a URL string or null. */
function embedRewrite(u) {
  const host = bare(u.hostname);
  const seg = u.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "music.youtube.com") {
    let id = null;
    if (seg[0] === "watch") id = u.searchParams.get("v");
    else if (["shorts", "live", "embed", "v"].includes(seg[0])) id = seg[1];
    if (id && /^[\w-]{6,}$/.test(id)) {
      const t = parseInt(u.searchParams.get("t") || u.searchParams.get("start") || "", 10);
      return `https://www.youtube.com/embed/${id}${t > 0 ? `?start=${t}` : ""}`;
    }
    if (seg[0] === "playlist" && u.searchParams.get("list")) {
      return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(u.searchParams.get("list"))}`;
    }
    return null;
  }
  if (host === "youtu.be" && seg[0] && /^[\w-]{6,}$/.test(seg[0])) {
    return `https://www.youtube.com/embed/${seg[0]}`;
  }

  if (host === "open.spotify.com") {
    const parts = seg[0] === "embed" ? seg.slice(1) : seg[0]?.startsWith("intl-") ? seg.slice(1) : seg;
    if (["track", "album", "playlist", "artist", "episode", "show"].includes(parts[0]) && parts[1]) {
      return `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`;
    }
    return null;
  }

  if (host === "vimeo.com" && /^\d+$/.test(seg[0] || "")) {
    return `https://player.vimeo.com/video/${seg[0]}`;
  }

  if (host === "google.com") {
    if (seg.length === 0 || seg[0] === "webhp" || seg[0] === "search") {
      const g = new URL(u.href);
      g.hostname = "www.google.com";
      if (seg.length === 0) g.pathname = "/webhp";
      g.searchParams.set("igu", "1");
      return g.href;
    }
    if (seg[0] === "maps" && seg[1] === "embed") return u.href;
    return null;
  }

  if (host === "bing.com" && seg[0] === "search") return u.href;

  if (host === "openstreetmap.org") {
    if (seg[0] === "export" && seg[1] === "embed.html") return u.href;
    if (seg.length === 0) {
      return "https://www.openstreetmap.org/export/embed.html?bbox=-168,-56,180,74&layer=mapnik";
    }
    return null;
  }
  return null;
}

/**
 * How should a web URL be displayed?
 * -> { policy: "allow" | "deny" | "unknown", src, host }
 * `src` is what the iframe should load (may differ from `url` for embed rewrites).
 */
export function embedInfo(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { policy: "deny", src: url, host: "" };
  }
  const host = u.hostname.toLowerCase();
  const rewritten = embedRewrite(u);
  if (rewritten) return { policy: "allow", src: rewritten, host };

  let src = u.href;
  // An https page cannot frame plain-http content (mixed content) — try the secure origin.
  if (u.protocol === "http:" && typeof window !== "undefined" && window.location.protocol === "https:") {
    src = "https:" + u.href.slice(5);
  }
  return { policy: hostPolicy(host), src, host };
}

const GITHUB_RESERVED = new Set([
  "about", "account", "apps", "collections", "contact", "copilot", "customer-stories", "dashboard",
  "enterprise", "events", "explore", "features", "issues", "join", "login", "logout", "marketplace",
  "new", "notifications", "organizations", "orgs", "pricing", "pulls", "readme", "search", "security",
  "session", "sessions", "settings", "signup", "site", "sponsors", "team", "topics", "trending",
]);

/** github.com/<user>[/<repo>] -> sherlock://github/<user>[/<repo>]; anything else -> null. */
export function githubToInternal(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (bare(u.hostname.toLowerCase()) !== "github.com") return null;
  const seg = u.pathname.split("/").filter(Boolean);
  if (seg.length < 1 || seg.length > 2) return null;
  if (GITHUB_RESERVED.has(seg[0].toLowerCase()) || !/^[\w.-]+$/.test(seg.join(""))) return null;
  if (u.searchParams.has("tab")) return null;
  return `sherlock://github/${seg.join("/")}`.replace(/\.git$/, "");
}
