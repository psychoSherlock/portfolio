// Desktop icon artwork: folders, per-kind documents, image thumbnails, and
// custom icons for .app / .webloc files (JSON may carry "icon": "skills/<file>.png").
import { memo, useEffect, useState } from "react";
import { LuGithub } from "react-icons/lu";
import { getApp } from "../../apps";
import fs from "../../fs";

const ICON_URLS = import.meta.glob("../../../assets/images/icons/**/*.{png,svg,webp,jpg}", {
  eager: true,
  import: "default",
  query: "?url",
});
const ICON_PREFIX = "../../../assets/images/icons/";
const resolveIcon = (name) =>
  typeof name === "string" ? ICON_URLS[ICON_PREFIX + name.replace(/^\/+/, "")] || null : null;

// Parsed JSON of .app/.webloc files, keyed by path + mtime.
const metaCache = new Map();

/** Reads the JSON payload of link/app files. Returns {} until loaded. */
function useFileMeta(item) {
  const wants = item.kind === "link" || item.kind === "app";
  const key = `${item.path}|${item.mtime}`;
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!wants || metaCache.has(key)) return;
    let alive = true;
    fs.readText(item.path).then((text) => {
      let data = {};
      try {
        data = JSON.parse(text) || {};
      } catch {
        /* not JSON: plain glyph */
      }
      metaCache.set(key, data);
      if (alive) setState({ key, data });
    });
    return () => {
      alive = false;
    };
  }, [wants, key, item.path]);
  if (!wants) return null;
  return metaCache.get(key) || (state?.key === key ? state.data : null) || {};
}

const KIND_COLOR = {
  pdf: "#e5484d",
  markdown: "#3b82f6",
  text: "#8e8e93",
  code: "#a35cf0",
  audio: "#ff375f",
  video: "#5e5ce6",
  link: "#0a84ff",
  app: "#28b463",
  image: "#30b0c7",
  unknown: "#8e8e93",
};

function FolderGlyph() {
  return (
    <svg viewBox="0 0 64 64" className="dicon-svg" aria-hidden="true">
      <path
        fill="#3f8ee6"
        d="M5 17a5 5 0 0 1 5-5h13.6a5 5 0 0 1 3.5 1.5l2.6 2.6a5 5 0 0 0 3.5 1.4H54a5 5 0 0 1 5 5V48a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z"
      />
      <rect fill="#66adf6" x="5" y="23" width="54" height="30" rx="5" />
      <rect x="5" y="23" width="54" height="1.4" rx="0.7" fill="#fff" opacity="0.45" />
    </svg>
  );
}

function KindMark({ kind }) {
  const stroke = { stroke: "#9a9aa3", strokeWidth: 2.2, strokeLinecap: "round", fill: "none" };
  switch (kind) {
    case "code":
      return (
        <g {...stroke} strokeLinejoin="round">
          <path d="M27 24l-6 6 6 6M37 24l6 6-6 6" />
        </g>
      );
    case "markdown":
      return (
        <g {...stroke} strokeLinejoin="round">
          <path d="M20 35V24l5 6 5-6v11M38 24v10M34.5 30.5L38 34l3.5-3.5" />
        </g>
      );
    case "audio":
      return (
        <path
          fill="#9a9aa3"
          d="M29 22.5l10-2.5v13.2a3.6 3.6 0 1 1-2-3.2V24l-6 1.5v9.7a3.6 3.6 0 1 1-2-3.2z"
        />
      );
    case "video":
      return <path d="M27 23.5v13l11-6.5z" fill="#9a9aa3" />;
    case "link":
      return (
        <g {...stroke}>
          <circle cx="32" cy="30" r="8" />
          <path d="M24 30h16M32 22c-3.6 4-3.6 12 0 16M32 22c3.6 4 3.6 12 0 16" strokeWidth="1.6" />
        </g>
      );
    case "app":
      return (
        <g fill="#9a9aa3">
          <rect x="24" y="22" width="7" height="7" rx="2" />
          <rect x="33" y="22" width="7" height="7" rx="2" />
          <rect x="24" y="31" width="7" height="7" rx="2" />
          <rect x="33" y="31" width="7" height="7" rx="2" />
        </g>
      );
    case "image":
      return (
        <g {...stroke} strokeLinejoin="round">
          <path d="M22 37l7-8 5 5 3-3 5 6" />
          <circle cx="38" cy="24" r="2" fill="#9a9aa3" stroke="none" />
        </g>
      );
    case "pdf":
      return (
        <g {...stroke}>
          <path d="M21 23h22M21 28h22M21 33h14" />
        </g>
      );
    default:
      return (
        <g {...stroke}>
          <path d="M21 24h15M21 30h22M21 36h18" />
        </g>
      );
  }
}

function DocGlyph({ kind, ext }) {
  const color = KIND_COLOR[kind] || KIND_COLOR.unknown;
  const label = (ext || "").toUpperCase().slice(0, 4);
  return (
    <svg viewBox="0 0 64 64" className="dicon-svg" aria-hidden="true">
      <path
        d="M16 5h23l13 13v37a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4z"
        fill="#f8f8fa"
        stroke="rgba(0,0,0,0.22)"
        strokeWidth="1"
      />
      <path d="M39 5v9a4 4 0 0 0 4 4h9z" fill="#d6d6dc" />
      <KindMark kind={kind} />
      {label ? (
        <>
          <rect x="16" y="42" width="32" height="12" rx="3" fill={color} />
          <text
            x="32"
            y="51"
            textAnchor="middle"
            fontSize={label.length > 3 ? 7.4 : 8.4}
            fontWeight="700"
            fill="#fff"
            fontFamily="-apple-system, 'SF Pro Text', Inter, Helvetica, Arial, sans-serif"
            letterSpacing="0.4"
          >
            {label}
          </text>
        </>
      ) : null}
    </svg>
  );
}

const isGithub = (url) => {
  try {
    return /(^|\.)github\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

function DeskIcon({ item }) {
  const meta = useFileMeta(item);
  const [failed, setFailed] = useState(null);

  let src = null;
  let tile = false;
  if (item.type === "file") {
    if (item.kind === "image") src = fs.thumb(item.path);
    else if (meta) {
      src = resolveIcon(meta.icon) || (item.kind === "app" ? getApp(meta.app)?.icon : null);
      tile = !!resolveIcon(meta.icon) && item.kind === "link";
    }
  }

  let body;
  if (item.type === "dir") body = <FolderGlyph />;
  else if (src && failed !== src) {
    body = (
      <img
        className={item.kind === "image" ? "dicon-thumb" : tile ? "dicon-tile" : "dicon-img"}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(src)}
      />
    );
  } else if (item.kind === "link" && meta?.url && isGithub(meta.url)) {
    body = (
      <span className="dicon-gh" aria-hidden="true">
        <LuGithub />
      </span>
    );
  } else body = <DocGlyph kind={item.kind} ext={item.ext} />;

  return <span className="dicon-art">{body}</span>;
}

export default memo(
  DeskIcon,
  (a, b) => a.item.path === b.item.path && a.item.mtime === b.item.mtime && a.item.type === b.item.type
);
