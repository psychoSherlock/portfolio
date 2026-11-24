// The Finder's own icon set: folder, per-kind documents, image thumbnails.
import { memo, useState } from "react";
import fs from "../../os/fs";

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
    <svg viewBox="0 0 64 64" className="finder-ico-svg" aria-hidden="true">
      <path
        className="finder-ico-folder-back"
        d="M5 17a5 5 0 0 1 5-5h13.6a5 5 0 0 1 3.5 1.5l2.6 2.6a5 5 0 0 0 3.5 1.4H54a5 5 0 0 1 5 5V48a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z"
      />
      <rect className="finder-ico-folder-front" x="5" y="23" width="54" height="30" rx="5" />
      <rect x="5" y="23" width="54" height="1.4" rx="0.7" fill="#fff" opacity="0.38" />
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
    case "audio":
      return (
        <g fill="#9a9aa3">
          <path d="M29 22.5l10-2.5v13.2a3.6 3.6 0 1 1-2-3.2V24l-6 1.5v9.7a3.6 3.6 0 1 1-2-3.2z" />
        </g>
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
    default:
      return (
        <g {...stroke}>
          <path d="M21 24h15M21 30h22M21 36h18" />
        </g>
      );
  }
}

function DocGlyph({ kind, ext, detail }) {
  const color = KIND_COLOR[kind] || KIND_COLOR.unknown;
  const label = (ext || "").toUpperCase().slice(0, 4);
  return (
    <svg viewBox="0 0 64 64" className="finder-ico-svg" aria-hidden="true">
      <path
        d="M16 5h23l13 13v37a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4z"
        fill="#f8f8fa"
        stroke="rgba(0,0,0,0.22)"
        strokeWidth="1"
      />
      <path d="M39 5v9a4 4 0 0 0 4 4h9z" fill="#d6d6dc" />
      {detail ? (
        <>
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
        </>
      ) : (
        <>
          <rect x="18" y="24" width="28" height="5" rx="2" fill="#c3c3cb" />
          <rect x="18" y="36" width="28" height="14" rx="3.5" fill={color} />
        </>
      )}
    </svg>
  );
}

/**
 * item: fs stat ({ path, type, kind, ext }).
 * size: px box (omit to fill the parent). detail=false simplifies glyphs for 16-20px icons.
 */
function FileIcon({ item, size, detail = true }) {
  const [failed, setFailed] = useState(null);
  const style = size ? { width: size, height: size } : undefined;
  let body;
  if (item.type === "dir") body = <FolderGlyph />;
  else {
    const thumb = item.kind === "image" ? fs.thumb(item.path) : null;
    if (thumb && failed !== thumb) {
      body = (
        <img
          className={`finder-ico-thumb${detail ? "" : " finder-ico-thumb--sm"}`}
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(thumb)}
        />
      );
    } else body = <DocGlyph kind={item.kind} ext={item.ext} detail={detail} />;
  }
  return (
    <span className="finder-ico" style={style}>
      {body}
    </span>
  );
}

export default memo(
  FileIcon,
  (a, b) =>
    a.size === b.size &&
    a.detail === b.detail &&
    a.item.path === b.item.path &&
    a.item.type === b.item.type &&
    a.item.mtime === b.item.mtime
);
