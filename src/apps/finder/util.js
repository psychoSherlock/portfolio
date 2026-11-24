// Shared helpers for the Finder: naming, sorting, kinds, dates.
import fs, { HOME, TRASH, basename, dirname } from "../../os/fs";
import { getApp } from "../../os/apps";
import { DEFAULT_APP } from "../../os/open";

export const VIEWS = [
  { id: "icons", label: "as Icons" },
  { id: "list", label: "as List" },
  { id: "columns", label: "as Columns" },
  { id: "gallery", label: "as Gallery" },
];

export const SORTS = [
  { id: "name", label: "Name" },
  { id: "kind", label: "Kind" },
  { id: "date", label: "Date Modified" },
  { id: "size", label: "Size" },
];

export const inTrash = (p) => p === TRASH || p.startsWith(TRASH + "/");

/** Human name of a folder/file as the Finder shows it. */
export const displayName = (p) =>
  p === "/" ? "SherlockOS" : p === TRASH ? "Trash" : basename(p);

const KIND_LABELS = {
  dir: "Folder",
  pdf: "PDF document",
  markdown: "Markdown document",
  text: "Plain text document",
  link: "Web location",
  app: "Application",
};

export function kindLabel(item) {
  if (!item) return "";
  if (KIND_LABELS[item.kind]) return KIND_LABELS[item.kind];
  const ext = (item.ext || "").toUpperCase();
  if (item.kind === "image") return `${ext === "JPG" ? "JPEG" : ext} image`;
  if (item.kind === "audio") return `${ext} audio`;
  if (item.kind === "video") return `${ext} movie`;
  if (item.kind === "code") return `${ext} source`;
  return ext ? `${ext} file` : "Document";
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export function formatDate(ms) {
  if (!ms) return "--";
  const d = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  const time = timeFmt.format(d);
  if (diff === 0) return `Today at ${time}`;
  if (diff === 1) return `Yesterday at ${time}`;
  return `${dateFmt.format(d)} at ${time}`;
}

const byName = (a, b) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Sort a listing. Name/kind keep folders first (like fs.list); date/size mix them. */
export function sortItems(items, { key, dir }) {
  const sign = dir === "desc" ? -1 : 1;
  const foldersFirst = (a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1);
  let cmp;
  if (key === "kind")
    cmp = (a, b) => foldersFirst(a, b) || sign * kindLabel(a).localeCompare(kindLabel(b)) || byName(a, b);
  else if (key === "date") cmp = (a, b) => sign * ((a.mtime || 0) - (b.mtime || 0)) || byName(a, b);
  else if (key === "size") cmp = (a, b) => sign * ((a.size || 0) - (b.size || 0)) || byName(a, b);
  else cmp = (a, b) => foldersFirst(a, b) || sign * byName(a, b);
  return [...items].sort(cmp);
}

/** Item count (direct children) and recursive byte size of a folder. */
export function folderInfo(path) {
  const count = fs.list(path, { hidden: path === TRASH }).length;
  let size = 0;
  for (const f of fs.walk(path)) size += f.size || 0;
  return { count, size };
}

export const countLabel = (n) => (n === 1 ? "1 item" : `${n} items`);

/** "/" -> ["/"], "/home/sherlock" -> ["/", "/home", "/home/sherlock"] */
export function ancestors(p) {
  const out = [p];
  while (p !== "/") {
    p = dirname(p);
    out.unshift(p);
  }
  return out;
}

/** Where Miller columns start for a given folder. */
export function columnBase(cwd) {
  if (inTrash(cwd)) return TRASH;
  if (cwd === HOME || cwd.startsWith(HOME + "/")) return HOME;
  return "/";
}

const OPEN_WITH = {
  image: ["preview", "photos"],
  pdf: ["preview"],
  markdown: ["textedit"],
  text: ["textedit"],
  code: ["textedit"],
  link: ["textedit"],
  app: ["textedit"],
  audio: ["music"],
  video: ["preview"],
  unknown: ["textedit"],
};

/** Apps that can open an item: [{ id, name }]. */
export function openWithApps(item) {
  if (!item || item.type === "dir") return [];
  return (OPEN_WITH[item.kind] || OPEN_WITH.unknown)
    .map((id) => getApp(id))
    .filter(Boolean)
    .map((a) => ({ id: a.id, name: a.name }));
}

/** Name of the app that opens an item by default (null for links/apps/folders). */
export function defaultAppName(item) {
  if (!item || item.type === "dir") return null;
  if (item.kind === "link" || item.kind === "app") return null;
  return getApp(DEFAULT_APP[item.kind] || "textedit")?.name || null;
}

/** Scroll an element into view inside its nearest .os-scroll ancestor only. */
export function revealElement(el) {
  const scroller = el?.closest(".os-scroll");
  if (!scroller) return;
  const r = el.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();
  const head = scroller.querySelector(".finder-list-head")?.offsetHeight || 0;
  if (r.top < s.top + head) scroller.scrollTop -= s.top + head - r.top + 4;
  else if (r.bottom > s.bottom) scroller.scrollTop += r.bottom - s.bottom + 4;
  if (r.left < s.left) scroller.scrollLeft -= s.left - r.left + 4;
  else if (r.right > s.right) scroller.scrollLeft += r.right - s.right + 4;
}
