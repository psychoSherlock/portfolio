import { memo, useState } from "react";
import { LuBookmark, LuCompass, LuGlobe, LuHistory, LuInfo, LuTriangleAlert } from "react-icons/lu";
import { classify, faviconUrl } from "./urls";

const INTERNAL_ICONS = {
  start: LuCompass,
  history: LuHistory,
  bookmarks: LuBookmark,
  about: LuInfo,
  error: LuTriangleAlert,
};

/** Site icon for any URL: Google's favicon service for the web, glyphs for sherlock:// pages. */
export const Favicon = memo(function Favicon({ url, size = 16, className = "" }) {
  const [failed, setFailed] = useState(null);
  const c = classify(url);
  const cls = `safari-favicon ${className}`;
  const style = { width: size, height: size };

  if (c.kind === "internal" && c.page !== "github") {
    const Icon = INTERNAL_ICONS[c.page] || LuGlobe;
    return (
      <span className={`${cls} safari-favicon--glyph`} style={style} aria-hidden="true">
        <Icon size={Math.round(size * 0.86)} />
      </span>
    );
  }
  const src = faviconUrl(url, size > 32 ? 128 : 64);
  if (!src || failed === src) {
    return (
      <span className={`${cls} safari-favicon--glyph`} style={style} aria-hidden="true">
        <LuGlobe size={Math.round(size * 0.86)} />
      </span>
    );
  }
  return (
    <img
      className={cls}
      style={style}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
    />
  );
});
