// Pure helpers shared by the terminal commands (no React, no DOM, no Vite features).
import { ShellError, flat } from "./shell.js";

// ---------------------------------------------------------------------------
// Option parsing: GNU-style short flags (-la), values (-n 5 / -n5), long options, "--".
// ---------------------------------------------------------------------------
/**
 * spec: { flags: "lahR", values: "n", long: { all: "a", lines: "n" }, numeric: "n" }
 * - values: short options that take an argument
 * - long: long option -> short key (or its own name)
 * - numeric: key that receives "-5" style shorthands (head -5)
 * Returns { o: { a: true, n: "5" }, rest: [...] }.
 */
export function getopts(cmd, args, spec = {}) {
  const flags = spec.flags || "";
  const values = spec.values || "";
  const long = spec.long || {};
  const o = {};
  const rest = [];
  const bad = (msg) => {
    const e = new ShellError(`${cmd}: ${msg}\nTry '${cmd} --help' for more information.`);
    e.code = 2;
    return e;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      rest.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--") && a.length > 2) {
      const [name, val] = a.slice(2).split(/=(.*)/s);
      if (!Object.hasOwn(long, name)) throw bad(`unrecognized option '${a}'`);
      const key = long[name];
      if (values.includes(key) || spec.longValues?.includes(name)) {
        const v = val ?? args[++i];
        if (v == null) throw bad(`option '--${name}' requires an argument`);
        o[key] = v;
      } else o[key] = true;
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      if (spec.numeric && /^-\d+$/.test(a)) {
        o[spec.numeric] = a.slice(1);
        continue;
      }
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (values.includes(ch)) {
          const v = a.slice(j + 1) || args[++i];
          if (v == null) throw bad(`option requires an argument -- '${ch}'`);
          o[ch] = v;
          break;
        }
        if (!flags.includes(ch)) throw bad(`invalid option -- '${ch}'`);
        o[ch] = true;
      }
      continue;
    }
    rest.push(a);
  }
  return { o, rest };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export const padL = (s, n) => String(s).padStart(n);
export const padR = (s, n) => String(s).padEnd(n);

/** ls -h / du -h style: 4.0K, 12M. */
export function human(bytes) {
  if (bytes == null) return "0";
  if (bytes < 1024) return String(bytes);
  const units = ["K", "M", "G", "T"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) (v /= 1024), i++;
  return (v < 10 ? (Math.ceil(v * 10) / 10).toFixed(1) : String(Math.ceil(v))) + units[i];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export { MONTHS, MONTHS_LONG, DAYS };

const two = (n) => String(n).padStart(2, "0");

/** ls -l timestamp: "Nov 24 13:37" (recent) or "Nov 24  2024" (older than ~6 months). */
export function lsDate(ms, now = Date.now()) {
  const d = new Date(ms || now);
  const recent = Math.abs(now - d.getTime()) < 182 * 864e5;
  const tail = recent ? `${two(d.getHours())}:${two(d.getMinutes())}` : ` ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${padL(d.getDate(), 2)} ${tail}`;
}

function tzName(d) {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
        .formatToParts(d)
        .find((p) => p.type === "timeZoneName")?.value || "UTC"
    );
  } catch {
    return "UTC";
  }
}
function tzOffset(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${sign}${two(Math.floor(Math.abs(off) / 60))}${two(Math.abs(off) % 60)}`;
}

/** strftime subset used by date(1). */
export function strftime(fmt, d = new Date(), utc = false) {
  const g = utc
    ? { Y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes(), S: d.getUTCSeconds(), w: d.getUTCDay() }
    : { Y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), H: d.getHours(), M: d.getMinutes(), S: d.getSeconds(), w: d.getDay() };
  const start = utc ? Date.UTC(g.Y, 0, 1) : new Date(g.Y, 0, 1).getTime();
  const doy = Math.floor((d.getTime() - start) / 864e5) + 1;
  const map = {
    Y: g.Y, y: two(g.Y % 100), m: two(g.m + 1), d: two(g.d), e: padL(g.d, 2),
    H: two(g.H), I: two(g.H % 12 || 12), M: two(g.M), S: two(g.S), p: g.H < 12 ? "AM" : "PM",
    A: DAYS_LONG[g.w], a: DAYS[g.w], B: MONTHS_LONG[g.m], b: MONTHS[g.m], h: MONTHS[g.m],
    j: String(doy).padStart(3, "0"), s: Math.floor(d.getTime() / 1000), u: g.w || 7, w: g.w,
    Z: utc ? "UTC" : tzName(d), z: utc ? "+0000" : tzOffset(d), n: "\n", t: "\t", "%": "%",
    F: `${g.Y}-${two(g.m + 1)}-${two(g.d)}`, T: `${two(g.H)}:${two(g.M)}:${two(g.S)}`,
    D: `${two(g.m + 1)}/${two(g.d)}/${two(g.Y % 100)}`, R: `${two(g.H)}:${two(g.M)}`,
  };
  return fmt.replace(/%([A-Za-z%])/g, (m, k) => (k in map ? String(map[k]) : m));
}

export const defaultDate = (d = new Date(), utc = false) => strftime("%a %b %e %T %Z %Y", d, utc);

/** "3 min", "2:05", "1 day,  4:12" like uptime(1). */
export function uptimeText(ms) {
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const hm = h ? `${padL(h, 2)}:${two(m)}` : `${m} min`;
  return days ? `${days} day${days > 1 ? "s" : ""}, ${hm}` : hm;
}

/** Word-wrap plain text to width (keeps explicit newlines). */
export function wrap(text, width, indent = "") {
  const w = Math.max(10, width - indent.length);
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > w) {
        out.push(indent + line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
      while (line.length > w) {
        out.push(indent + line.slice(0, w));
        line = line.slice(w);
      }
    }
    out.push(indent + line);
  }
  return out;
}

/** Shell glob (* ? [abc]) -> RegExp, for find -name. */
export function globRe(pattern, flags = "") {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else if (ch === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close === -1) re += "\\[";
      else {
        re += "[" + pattern.slice(i + 1, close).replace(/^!/, "^").replace(/\\/g, "\\\\") + "]";
        i = close;
      }
    } else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, flags);
}

/** Stable small hash for fake inode numbers, PIDs, etc. */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Unix permission string for a stat record. */
export function perms(st) {
  if (st.type === "dir") return "drwxr-xr-x";
  if (/^(sh|bash|zsh|py)$/.test(st.ext)) return "-rwxr-xr-x";
  return "-rw-r--r--";
}

/** Colour style for a stat record in ls/tree/find output (GNU dircolors-ish). */
export function lsStyle(st) {
  if (st.type === "dir") return "blue bold";
  if (/^(sh|bash|zsh|py)$/.test(st.ext)) return "green bold";
  switch (st.kind) {
    case "image":
    case "video":
      return "magenta bold";
    case "audio":
      return "cyan";
    case "pdf":
      return "red";
    case "link":
    case "app":
      return "cyan bold";
    default:
      return /^(zip|gz|tar|xz|7z|rar|deb)$/.test(st.ext) ? "red bold" : null;
  }
}

/** Byte length of a string in UTF-8. */
export const byteLen = (s) => new TextEncoder().encode(s).length;

/** Text -> lines without the trailing empty line. */
export function lines(text) {
  if (!text) return [];
  const l = text.split("\n");
  if (l[l.length - 1] === "") l.pop();
  return l;
}

// ---------------------------------------------------------------------------
// Live syntax highlighting of the input line (zsh-syntax-highlighting, Kali defaults-ish).
// isCommand(name) -> bool, pathExists(word) -> bool. Returns segments covering every char.
// ---------------------------------------------------------------------------
const SEPARATORS = ["&&", "||", "|", ";", "&"];
const REDIRS = ["2>&1", "&>", "2>>", "2>", ">>", ">", "<"];

export function highlight(line, isCommand, pathExists) {
  const out = [];
  const n = line.length;
  let i = 0;
  let cmdPos = true;
  const push = (t, s) => t && out.push(s ? { t, s } : { t });
  while (i < n) {
    const ch = line[i];
    if (ch === " " || ch === "\t") {
      let j = i;
      while (j < n && (line[j] === " " || line[j] === "\t")) j++;
      push(line.slice(i, j));
      i = j;
      continue;
    }
    const sep = SEPARATORS.find((o) => line.startsWith(o, i));
    const red = REDIRS.find((o) => line.startsWith(o, i));
    if (red && (!sep || red.length >= sep.length)) {
      push(red, "blue bold");
      i += red.length;
      continue;
    }
    if (sep) {
      push(sep, "blue bold");
      i += sep.length;
      cmdPos = true;
      continue;
    }
    if (ch === "#") {
      push(line.slice(i), "gray");
      break;
    }
    // a word: [start, j)
    let j = i;
    let q = null;
    while (j < n) {
      const d = line[j];
      if (q) {
        if (d === q) q = null;
        else if (d === "\\" && q === '"') j++;
      } else if (d === "'" || d === '"') q = d;
      else if (d === "\\") j++;
      else if (d === " " || d === "\t" || ";|&<>".includes(d)) break;
      j++;
    }
    j = Math.min(j, n);
    const word = line.slice(i, j);
    const bare = word.replace(/\\(.)/g, "$1").replace(/['"]/g, "");
    if (cmdPos) {
      if (/^[A-Za-z_]\w*=/.test(word)) {
        push(word);
      } else {
        cmdPos = false;
        push(word, isCommand(bare) ? "green bold" : "red");
      }
    } else if (word.startsWith("-")) {
      push(word, "green");
    } else {
      const exists = !/[*?]/.test(bare) && bare && pathExists(bare);
      // split into quoted / glob / plain pieces
      let k = 0;
      while (k < word.length) {
        const d = word[k];
        if (d === "'" || d === '"') {
          let e = word.indexOf(d, k + 1);
          e = e === -1 ? word.length : e + 1;
          push(word.slice(k, e), "yellow");
          k = e;
        } else if (d === "*" || d === "?") {
          push(d, "blue bold");
          k++;
        } else if (d === "$") {
          const m = /^\$(\{[^}]*\}?|[A-Za-z_]\w*|[?$#!0-9])/.exec(word.slice(k));
          const t = m ? m[0] : "$";
          push(t, "cyan");
          k += t.length;
        } else {
          let e = k;
          while (e < word.length && !"'\"*?$".includes(word[e])) e += word[e] === "\\" ? 2 : 1;
          push(word.slice(k, e), exists ? "underline" : null);
          k = e;
        }
      }
    }
    i = j;
  }
  return out;
}

/** Split segments at a character index -> [left, right]. */
export function splitSegs(segs, index) {
  const left = [];
  const right = [];
  let pos = 0;
  for (const seg of segs) {
    const end = pos + seg.t.length;
    if (end <= index) left.push(seg);
    else if (pos >= index) right.push(seg);
    else {
      left.push({ ...seg, t: seg.t.slice(0, index - pos) });
      right.push({ ...seg, t: seg.t.slice(index - pos) });
    }
    pos = end;
  }
  return [left, right];
}

/** Simple table renderer: rows of cells (strings or segments), returns lines of segments. */
export function table(rows, { gap = 2, align = [] } = {}) {
  const text = (cell) => (typeof cell === "string" ? cell : flat(cell).map((s) => s.t).join(""));
  const widths = [];
  for (const r of rows) r.forEach((cell, i) => (widths[i] = Math.max(widths[i] || 0, text(cell).length)));
  return rows.map((r) =>
    flat(
      r.map((cell, i) => {
        const len = text(cell).length;
        const fill = " ".repeat(Math.max(0, widths[i] - len));
        const last = i === r.length - 1;
        if (align[i] === "right") return [fill, cell, last ? "" : " ".repeat(gap)];
        return [cell, last ? "" : fill + " ".repeat(gap)];
      })
    )
  );
}
