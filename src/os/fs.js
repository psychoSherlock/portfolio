// Virtual filesystem.
// Base tree comes from the generated manifest (real assets + src/content/home text files).
// User changes (new files, edits, moves, trash) are an ops log persisted to localStorage
// and replayed over the base tree on load.
import { useSyncExternalStore } from "react";
import manifest, { HOME as MANIFEST_HOME } from "../data/fileSystemData";

export const HOME = MANIFEST_HOME;
export const TRASH = `${HOME}/.Trash`;
export const DESKTOP = `${HOME}/Desktop`;
const STORAGE_KEY = "sherlockos.fs.ops";

// ---- asset resolution -----------------------------------------------------
const assetUrls = import.meta.glob(
  [
    "../assets/Documents/**/*",
    "../assets/images/Wallpappers/**/*",
    "../assets/images/personal/**/*",
    "../assets/images/achievements/**/*",
    "../assets/thumbs/**/*",
  ],
  { eager: true, import: "default", query: "?url" }
);
const textLoaders = import.meta.glob("../content/home/**/*", {
  query: "?raw",
  import: "default",
});

// ---- path helpers ---------------------------------------------------------
export function normalize(p) {
  const out = [];
  for (const part of String(p).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}
export const join = (...parts) => normalize(parts.join("/"));
export const dirname = (p) => {
  const n = normalize(p);
  const i = n.lastIndexOf("/");
  return i <= 0 ? "/" : n.slice(0, i);
};
export const basename = (p) => {
  const n = normalize(p);
  return n === "/" ? "/" : n.slice(n.lastIndexOf("/") + 1);
};
export const extname = (p) => {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i <= 0 ? "" : b.slice(i + 1).toLowerCase();
};
/** Resolve a possibly relative path (supports ~, ., ..) against cwd. */
export function resolve(cwd, p = "") {
  if (!p) return normalize(cwd);
  if (p === "~" || p.startsWith("~/")) return normalize(HOME + p.slice(1));
  return p.startsWith("/") ? normalize(p) : normalize(`${cwd}/${p}`);
}
/** Pretty path for display: /home/sherlock/x -> ~/x */
export const tilde = (p) =>
  p === HOME ? "~" : p.startsWith(HOME + "/") ? "~" + p.slice(HOME.length) : p;

// ---- file kinds -----------------------------------------------------------
const KINDS = {
  image: ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp", "avif"],
  pdf: ["pdf"],
  markdown: ["md", "markdown"],
  text: ["txt", "log", "rtf", "csv", "ini", "conf", "cfg", "env"],
  code: [
    "js", "jsx", "ts", "tsx", "json", "html", "css", "py", "sh", "bash", "zsh",
    "c", "h", "cpp", "rs", "go", "java", "rb", "php", "yml", "yaml", "toml", "xml", "sql",
  ],
  audio: ["mp3", "m4a", "wav", "ogg", "flac"],
  video: ["mp4", "webm", "mov", "mkv"],
  link: ["webloc", "url"], // JSON text: { "url": "https://…" }
  app: ["app"], // JSON text: { "app": "<appId>", "props": {…} }
};
const EXT_KIND = {};
for (const [kind, exts] of Object.entries(KINDS)) exts.forEach((e) => (EXT_KIND[e] = kind));

/** "image" | "pdf" | "markdown" | "text" | "code" | "audio" | "video" | "link" | "app" | "unknown" */
export const kindOf = (name) => EXT_KIND[extname(name)] || "unknown";
export const isTextKind = (kind) =>
  kind === "text" || kind === "markdown" || kind === "code" || kind === "link" || kind === "app";

export function formatSize(bytes) {
  if (bytes == null) return "--";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) (v /= 1024), i++;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

// ---- state ----------------------------------------------------------------
/** @type {Map<string, {path,name,type:'dir'|'file',size,mtime,asset?,content?,text?,builtin:boolean,trashedFrom?}>} */
let nodes = new Map();
let ops = [];
let version = 0;
const listeners = new Set();

function baseTree() {
  const map = new Map();
  for (const e of manifest) {
    map.set(e.p, {
      path: e.p,
      name: basename(e.p),
      type: e.t === "d" ? "dir" : "file",
      size: e.s ?? null,
      mtime: e.m ?? null,
      asset: e.a,
      content: e.c,
      builtin: true,
    });
  }
  return map;
}

function emit() {
  version++;
  listeners.forEach((l) => l());
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
  } catch {
    /* storage full or unavailable: changes stay in memory */
  }
}

// Raw mutations (no persistence) — shared by the public API and log replay.
const raw = {
  mkdir(p) {
    const parts = p.split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur += "/" + part;
      if (!nodes.has(cur))
        nodes.set(cur, { path: cur, name: part, type: "dir", size: null, mtime: Date.now(), builtin: false });
    }
  },
  write(p, text, mtime = Date.now()) {
    raw.mkdir(dirname(p));
    const prev = nodes.get(p);
    nodes.set(p, {
      ...(prev || { builtin: false }),
      path: p,
      name: basename(p),
      type: "file",
      size: new Blob([text]).size,
      mtime,
      text,
      content: undefined,
      asset: prev?.asset && text == null ? prev.asset : undefined,
    });
  },
  move(from, to, extra) {
    if (!nodes.has(from) || from === to || to.startsWith(from + "/")) return;
    raw.mkdir(dirname(to));
    const moved = [];
    for (const [p, n] of nodes) {
      if (p === from || p.startsWith(from + "/")) moved.push([p, n]);
    }
    for (const [p, n] of moved) {
      nodes.delete(p);
      const np = to + p.slice(from.length);
      nodes.set(np, { ...n, path: np, name: basename(np), ...(p === from ? extra : null) });
    }
  },
  copy(from, to) {
    if (!nodes.has(from) || to.startsWith(from + "/")) return;
    raw.mkdir(dirname(to));
    for (const [p, n] of [...nodes]) {
      if (p === from || p.startsWith(from + "/")) {
        const np = to + p.slice(from.length);
        nodes.set(np, { ...n, path: np, name: basename(np), builtin: false, mtime: Date.now() });
      }
    }
  },
  remove(p) {
    for (const key of [...nodes.keys()]) {
      if (key === p || key.startsWith(p + "/")) nodes.delete(key);
    }
  },
};

function apply(op) {
  switch (op.op) {
    case "mkdir": return raw.mkdir(op.p);
    case "write": return raw.write(op.p, op.text, op.m);
    case "move": return raw.move(op.from, op.to, op.extra);
    case "copy": return raw.copy(op.from, op.to);
    case "remove": return raw.remove(op.p);
  }
}

function commit(op) {
  apply(op);
  ops.push(op);
  persist();
  emit();
}

function load() {
  nodes = baseTree();
  try {
    ops = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(ops)) ops = [];
  } catch {
    ops = [];
  }
  for (const op of ops) {
    try {
      apply(op);
    } catch {
      /* skip corrupt op */
    }
  }
}
load();

const stat = (n) =>
  n && {
    path: n.path,
    name: n.name,
    type: n.type,
    size: n.size,
    mtime: n.mtime,
    kind: n.type === "dir" ? "dir" : kindOf(n.name),
    ext: n.type === "dir" ? "" : extname(n.name),
    builtin: !!n.builtin,
    trashedFrom: n.trashedFrom,
  };

const protectedPaths = () =>
  new Set(["/", "/home", HOME, TRASH, DESKTOP, `${HOME}/Documents`, `${HOME}/Pictures`, `${HOME}/Downloads`]);

/** Find a free name in a directory: "file.txt" -> "file 2.txt". */
function uniquePath(p) {
  if (!nodes.has(p)) return p;
  const dir = dirname(p);
  const base = basename(p);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = join(dir, `${stem} ${i}${ext}`);
    if (!nodes.has(candidate)) return candidate;
  }
}

export const fs = {
  HOME,
  TRASH,
  DESKTOP,

  exists: (p) => nodes.has(normalize(p)),
  stat: (p) => stat(nodes.get(normalize(p))) || null,
  isDir: (p) => nodes.get(normalize(p))?.type === "dir",
  isFile: (p) => nodes.get(normalize(p))?.type === "file",

  /** Directory listing: folders first, then natural name order. Hidden (dot) entries excluded unless opts.hidden. */
  list(p, opts = {}) {
    const dir = normalize(p);
    const prefix = dir === "/" ? "/" : dir + "/";
    const out = [];
    for (const [key, n] of nodes) {
      if (key !== dir && key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
        if (!opts.hidden && n.name.startsWith(".")) continue;
        out.push(stat(n));
      }
    }
    return out.sort(
      (a, b) =>
        (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
  },

  /** Every descendant file under a directory (recursive). */
  walk(p) {
    const dir = normalize(p);
    const prefix = dir === "/" ? "/" : dir + "/";
    const out = [];
    for (const [key, n] of nodes) {
      if (n.type === "file" && key.startsWith(prefix)) out.push(stat(n));
    }
    return out;
  },

  /** Case-insensitive name search under root. */
  search(query, root = "/", limit = 50) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const dir = normalize(root);
    const prefix = dir === "/" ? "/" : dir + "/";
    const out = [];
    for (const [key, n] of nodes) {
      if (!key.startsWith(prefix) || key.startsWith(TRASH)) continue;
      if (n.name.toLowerCase().includes(q)) {
        out.push(stat(n));
        if (out.length >= limit) break;
      }
    }
    return out;
  },

  /** URL for binary assets (images, pdfs, media). null for text-only/user files. */
  url(p) {
    const n = nodes.get(normalize(p));
    if (!n?.asset) return null;
    return assetUrls[`../assets/${n.asset}`] || null;
  },

  /** Small thumbnail URL for images when available, else the full URL. */
  thumb(p) {
    const n = nodes.get(normalize(p));
    if (!n?.asset) return null;
    return (
      assetUrls[`../assets/thumbs/${n.asset}.webp`] ||
      assetUrls[`../assets/${n.asset}`] ||
      null
    );
  },

  /** Read a text file. Resolves "" for missing/binary files. */
  async readText(p) {
    const n = nodes.get(normalize(p));
    if (!n || n.type !== "file") return "";
    if (typeof n.text === "string") return n.text;
    if (n.content != null) {
      const loader = textLoaders[`../content/home/${n.content}`];
      return loader ? await loader() : "";
    }
    if (n.asset && isTextKind(kindOf(n.name))) {
      const url = fs.url(p);
      return url ? (await fetch(url)).text() : "";
    }
    return "";
  },

  /** Create or overwrite a text file. Returns the path. */
  writeText(p, text = "") {
    const path = normalize(p);
    commit({ op: "write", p: path, text, m: Date.now() });
    return path;
  },

  /** Create a file with a unique name ("untitled 2.txt") and return its path. */
  createFile(dir, name = "untitled.txt", text = "") {
    return fs.writeText(uniquePath(join(dir, name)), text);
  },

  /** Create a folder (unique name if taken). Returns the path. */
  mkdir(p, { unique = false } = {}) {
    let path = normalize(p);
    if (unique) path = uniquePath(path);
    if (!nodes.has(path)) commit({ op: "mkdir", p: path });
    return path;
  },

  /** Move/rename. Returns the final path or null if not allowed. */
  move(from, to) {
    const a = normalize(from);
    let b = normalize(to);
    if (!nodes.has(a) || protectedPaths().has(a) || b === a || b.startsWith(a + "/")) return null;
    if (nodes.has(b)) b = uniquePath(b);
    commit({ op: "move", from: a, to: b });
    return b;
  },
  rename: (p, newName) => fs.move(p, join(dirname(p), newName)),

  copy(from, to) {
    const a = normalize(from);
    if (!nodes.has(a)) return null;
    const b = uniquePath(normalize(to));
    if (b.startsWith(a + "/")) return null;
    commit({ op: "copy", from: a, to: b });
    return b;
  },

  /** Move to Trash (remembers the original location). */
  trash(p) {
    const a = normalize(p);
    if (!nodes.has(a) || protectedPaths().has(a) || a.startsWith(TRASH)) return null;
    const b = uniquePath(join(TRASH, basename(a)));
    commit({ op: "move", from: a, to: b, extra: { trashedFrom: a } });
    return b;
  },

  /** Put a trashed item back where it came from. */
  restore(p) {
    const n = nodes.get(normalize(p));
    if (!n?.trashedFrom) return null;
    const target = uniquePath(n.trashedFrom);
    commit({ op: "move", from: n.path, to: target, extra: { trashedFrom: undefined } });
    return target;
  },

  /** Permanently delete. */
  remove(p) {
    const a = normalize(p);
    if (!nodes.has(a) || protectedPaths().has(a)) return false;
    commit({ op: "remove", p: a });
    return true;
  },

  emptyTrash() {
    fs.list(TRASH, { hidden: true }).forEach((n) => fs.remove(n.path));
  },

  /** Wipe all user changes and return to the pristine filesystem. */
  reset() {
    ops = [];
    persist();
    nodes = baseTree();
    emit();
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getVersion: () => version,
};

/** Re-render a component whenever the filesystem changes. Returns a version counter. */
export const useFs = () => useSyncExternalStore(fs.subscribe, fs.getVersion);

export default fs;
