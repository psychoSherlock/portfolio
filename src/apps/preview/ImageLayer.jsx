// One image, laid out at its natural pixel size and centered in the stage.
// Shows the small thumbnail (blurred) immediately, then fades the full image in
// once it has loaded and decoded, so switching photos never blocks the UI.
import { memo, useEffect, useState } from "react";
import fs from "../../os/fs";

/** Full-resolution pixel sizes we have already measured (path -> {w,h}). */
const sizeCache = new Map();
const preloaded = new Set();

/** Warm the browser cache for an image that is likely to be shown next. */
export function preloadImage(path) {
  const url = path && fs.url(path);
  if (!url || preloaded.has(url)) return;
  preloaded.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

function ImageLayer({ path, layerRef, onSize, className = "" }) {
  const url = fs.url(path);
  const thumb = fs.thumb(path);
  const hasThumb = !!thumb && thumb !== url;
  const [size, setSize] = useState(() => sizeCache.get(path) || null); // {w,h,exact}
  const [fullReady, setFullReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (size) onSize?.(path, size);
  }, [path, size, onSize]);

  const onThumbLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w && h) setSize((s) => s || { w, h, exact: false });
  };
  const onFullLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (!w || !h) return;
    const next = { w, h, exact: true };
    sizeCache.set(path, next);
    setSize((s) => (s && s.exact && s.w === w && s.h === h ? s : next));
    setFullReady(true);
  };

  if (!url || failed) {
    return <div className="preview-layer-error">This image could not be displayed.</div>;
  }

  return (
    <div
      ref={layerRef}
      className={`preview-layer ${className}`}
      style={
        size
          ? { width: size.w, height: size.h, marginLeft: -size.w / 2, marginTop: -size.h / 2 }
          : { width: 1, height: 1, visibility: "hidden" }
      }
    >
      {hasThumb && (
        <img
          className="preview-layer-thumb"
          src={thumb}
          alt=""
          draggable={false}
          decoding="async"
          data-hidden={fullReady}
          style={
            size && !size.exact
              ? { filter: `blur(${(Math.max(size.w, size.h) / 110).toFixed(1)}px)` }
              : undefined
          }
          onLoad={onThumbLoad}
        />
      )}
      <img
        className="preview-layer-full"
        src={url}
        alt={path.slice(path.lastIndexOf("/") + 1)}
        draggable={false}
        decoding="async"
        data-ready={fullReady}
        onLoad={onFullLoad}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export default memo(ImageLayer);
