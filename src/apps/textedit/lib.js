// TextEdit helpers: syntax highlighting, markdown rendering, find utilities.
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import markdown from "highlight.js/lib/languages/markdown";
import fs, { resolve } from "../../os/fs";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("python", python);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("markdown", markdown);

/** Above this size we skip highlighting and find overlays to keep typing smooth. */
export const LARGE_FILE = 400 * 1024;
export const MAX_MATCHES = 5000;

// extension -> [highlight.js language | null, display label]
const LANGS = {
  js: ["javascript", "JavaScript"],
  mjs: ["javascript", "JavaScript"],
  cjs: ["javascript", "JavaScript"],
  jsx: ["javascript", "JavaScript JSX"],
  ts: ["typescript", "TypeScript"],
  tsx: ["typescript", "TypeScript JSX"],
  json: ["json", "JSON"],
  webloc: ["json", "JSON"],
  url: ["json", "JSON"],
  app: ["json", "JSON"],
  sh: ["bash", "Shell"],
  bash: ["bash", "Shell"],
  zsh: ["bash", "Shell"],
  py: ["python", "Python"],
  c: ["c", "C"],
  h: ["c", "C Header"],
  cpp: ["cpp", "C++"],
  hpp: ["cpp", "C++"],
  cc: ["cpp", "C++"],
  go: ["go", "Go"],
  rs: ["rust", "Rust"],
  html: ["xml", "HTML"],
  htm: ["xml", "HTML"],
  xml: ["xml", "XML"],
  svg: ["xml", "SVG"],
  css: ["css", "CSS"],
  yml: ["yaml", "YAML"],
  yaml: ["yaml", "YAML"],
  sql: ["sql", "SQL"],
  md: ["markdown", "Markdown"],
  markdown: ["markdown", "Markdown"],
  java: [null, "Java"],
  rb: [null, "Ruby"],
  php: [null, "PHP"],
  toml: [null, "TOML"],
};

export const langOf = (ext) => LANGS[ext] || [null, null];

export const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Highlighted HTML for a source string (escaped plain text when unsupported or too large). */
export function highlight(text, lang) {
  if (!lang || text.length > LARGE_FILE || !hljs.getLanguage(lang)) return escapeHtml(text);
  try {
    return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(text);
  }
}

const slugify = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");

const isRelative = (u) => !!u && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Markdown -> sanitized HTML.
 * Returns { html, outline:[{ index, level, text }] }. Headings carry data-hidx / data-slug,
 * relative images are resolved against `dir` in the virtual filesystem.
 */
export function renderMarkdown(text, dir) {
  const big = text.length > LARGE_FILE;
  let raw;
  try {
    raw = marked.parse(text, { gfm: true, async: false });
  } catch {
    raw = `<pre>${escapeHtml(text)}</pre>`;
  }
  const clean = DOMPurify.sanitize(raw, { FORBID_TAGS: ["style", "form"], FORBID_ATTR: ["style"] });
  // Parse in an inert document so images don't start loading before paths are rewritten.
  const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, "text/html");
  const body = doc.body;

  const outline = [];
  const seen = new Map();
  body.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
    const label = h.textContent.trim();
    let slug = slugify(label) || "section";
    const n = seen.get(slug) || 0;
    seen.set(slug, n + 1);
    if (n) slug = `${slug}-${n}`;
    h.removeAttribute("id");
    h.setAttribute("data-hidx", String(outline.length));
    h.setAttribute("data-slug", slug);
    outline.push({ index: outline.length, level: Number(h.tagName[1]), text: label });
  });

  body.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (isRelative(src) || src.startsWith("/home/")) {
      const url = fs.url(resolve(dir, safeDecode(src.split(/[?#]/)[0])));
      if (url) img.setAttribute("src", url);
      else {
        const missing = doc.createElement("span");
        missing.className = "textedit-md-missing";
        missing.textContent = img.getAttribute("alt") || src;
        img.replaceWith(missing);
        return;
      }
    }
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    img.setAttribute("draggable", "false");
  });

  body.querySelectorAll("pre > code").forEach((code) => {
    const m = /language-([\w+#-]+)/.exec(code.className || "");
    const name = m ? m[1].toLowerCase() : "";
    code.classList.add("hljs");
    if (name) code.parentElement.setAttribute("data-lang", name);
    if (!big && name && hljs.getLanguage(name)) {
      try {
        code.innerHTML = hljs.highlight(code.textContent, { language: name, ignoreIllegals: true }).value;
      } catch {
        /* leave the block unhighlighted */
      }
    }
  });

  body.querySelectorAll("table").forEach((table) => {
    const wrap = doc.createElement("div");
    wrap.className = "textedit-md-table";
    table.replaceWith(wrap);
    wrap.appendChild(table);
  });

  body.querySelectorAll("a[href]").forEach((a) => {
    a.removeAttribute("target");
    a.setAttribute("draggable", "false");
  });

  return { html: body.innerHTML, outline };
}

/** What a clicked markdown link should do. */
export function classifyLink(href, dir) {
  if (!href) return { type: "none" };
  if (href.startsWith("#")) return { type: "anchor", slug: safeDecode(href.slice(1)).toLowerCase() };
  if (/^https?:\/\//i.test(href)) return { type: "url", url: href };
  if (/^(mailto|tel):/i.test(href)) return { type: "external", url: href };
  if (!isRelative(href) && !href.startsWith("/") && !href.startsWith("~")) return { type: "none" };
  const [p] = href.split(/[?#]/);
  return { type: "path", path: resolve(dir, safeDecode(p)) };
}

/** Start offsets of every occurrence of `query` in `text` (case-insensitive unless matchCase). */
export function findMatches(text, query, matchCase) {
  if (!query) return [];
  const hay = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
  // toLowerCase can change string length for a few exotic characters; fall back to exact search then.
  const safeHay = hay.length === text.length ? hay : text;
  const safeNeedle = hay.length === text.length ? needle : query;
  const out = [];
  let i = safeHay.indexOf(safeNeedle);
  while (i !== -1 && out.length < MAX_MATCHES) {
    out.push(i);
    i = safeHay.indexOf(safeNeedle, i + safeNeedle.length);
  }
  return out;
}

/** Remove all find marks previously inserted into a rendered container. */
export function clearMarks(root) {
  if (!root) return;
  const marks = root.querySelectorAll("mark.textedit-hit");
  if (!marks.length) return;
  const parents = new Set();
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    parents.add(parent);
    parent.replaceChild(document.createTextNode(m.textContent), m);
  });
  parents.forEach((p) => p.normalize());
}

/**
 * Wrap every occurrence of `query` inside `root` in <mark data-hit="n">. Matches may span
 * several text nodes (e.g. across syntax-highlighting spans). Returns the match count.
 */
export function markMatches(root, query, matchCase) {
  if (!root || !query) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let full = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue) continue;
    nodes.push({ node: n, start: full.length, end: full.length + n.nodeValue.length });
    full += n.nodeValue;
  }
  const matches = findMatches(full, query, matchCase);
  if (!matches.length) return 0;
  const len = query.length;

  // Walk backwards so earlier offsets stay valid while nodes are split.
  let mi = matches.length - 1;
  for (let ni = nodes.length - 1; ni >= 0 && mi >= 0; ni--) {
    const { node, start, end } = nodes[ni];
    while (mi >= 0 && matches[mi] >= end) mi--;
    for (let k = mi; k >= 0 && matches[k] + len > start; k--) {
      const from = Math.max(matches[k], start) - start;
      const to = Math.min(matches[k] + len, end) - start;
      if (to <= from) continue;
      const mid = node.splitText(from);
      mid.splitText(to - from);
      const mark = document.createElement("mark");
      mark.className = "textedit-hit";
      mark.setAttribute("data-hit", String(k));
      mid.parentNode.replaceChild(mark, mid);
      mark.appendChild(mid);
    }
  }
  return matches.length;
}

/** Scroll `el` into view inside `scroller` without touching any ancestor scroll positions. */
export function scrollWithin(scroller, el, offset = 16) {
  if (!scroller || !el) return;
  const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTop = Math.max(0, top - offset);
}

export function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Insert text at the textarea selection, keeping the native undo stack when possible. */
export function insertText(ta, text) {
  ta.focus();
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  if (!ok) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/** Tab / Shift+Tab behaviour for a textarea: two-space indent, block indent/outdent. */
export function handleTab(e) {
  const ta = e.currentTarget;
  const { selectionStart: s, selectionEnd: en, value } = ta;
  e.preventDefault();
  if (s === en && !e.shiftKey) {
    insertText(ta, "  ");
    return;
  }
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  let lineEnd = value.indexOf("\n", en > s && value[en - 1] === "\n" ? en - 1 : en);
  if (lineEnd === -1) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd);
  const next = e.shiftKey
    ? block.replace(/^( {1,2}|\t)/gm, "")
    : block.replace(/^/gm, "  ");
  if (next === block) return;
  ta.setSelectionRange(lineStart, lineEnd);
  insertText(ta, next);
  ta.setSelectionRange(lineStart, lineStart + next.length);
}
