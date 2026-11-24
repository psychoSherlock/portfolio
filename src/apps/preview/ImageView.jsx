import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuPanelLeft,
  LuZoomIn,
  LuZoomOut,
  LuMaximize,
  LuRotateCcw,
  LuRotateCw,
  LuPlay,
  LuPause,
  LuInfo,
  LuDownload,
  LuWallpaper,
  LuEllipsis,
  LuChevronLeft,
  LuChevronRight,
  LuFolderSearch,
} from "react-icons/lu";
import fs, { useFs, dirname, formatSize, tilde } from "../../os/fs";
import { wm } from "../../os/windowStore";
import { settings, useSettings } from "../../os/settingsStore";
import { contextMenu, notify } from "../../os/ui";
import useZoomPan from "./useZoomPan";
import useWindowKeys from "./useWindowKeys";
import ImageLayer, { preloadImage } from "./ImageLayer";

const MotionDiv = motion.div;
const SLIDE_MS = 3000;

export function setDesktopPicture(path) {
  settings.set({ wallpaper: path });
  notify({
    title: "Desktop Picture Changed",
    body: `"${path.slice(path.lastIndexOf("/") + 1)}" is now your wallpaper.`,
    appId: "preview",
  });
}

const formatDate = (ms) =>
  ms
    ? new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "--";

const Filmstrip = memo(function Filmstrip({ items, current, onPick }) {
  const ref = useRef(null);
  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector('[aria-current="true"]');
    if (!el) return;
    // scroll only the strip itself (scrollIntoView could move outer containers)
    const top = el.offsetTop - (strip.clientHeight - el.offsetHeight) / 2;
    const left = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
    strip.scrollTo({ top, left, behavior: "smooth" });
  }, [current]);
  return (
    <div className="preview-strip os-scroll" ref={ref} role="listbox" aria-label="Images in this folder">
      {items.map((it) => (
        <button
          key={it.path}
          className="preview-strip-item"
          role="option"
          aria-selected={it.path === current}
          aria-current={it.path === current}
          title={it.name}
          onClick={() => onPick(it.path)}
        >
          <img src={fs.thumb(it.path)} alt="" loading="lazy" decoding="async" draggable={false} />
        </button>
      ))}
    </div>
  );
});

export default function ImageView({ windowId, path, onNavigate }) {
  useFs();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const stat = fs.stat(path);
  const url = fs.url(path);
  const dir = dirname(path);

  const siblings = useMemo(
    () => fs.list(dir).filter((n) => n.kind === "image" && fs.url(n.path)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dir, fs.getVersion()]
  );
  const index = siblings.findIndex((n) => n.path === path);
  const many = siblings.length > 1;

  const [nat, setNat] = useState(null); // { path, w, h, exact }
  const [strip, setStrip] = useState(true);
  const [inspector, setInspector] = useState(false);
  const [playing, setPlaying] = useState(false);
  const pathRef = useRef(path);
  pathRef.current = path;

  const natural = nat && nat.path === path ? nat : null;
  const zoom = useZoomPan(natural, path, { pad: 16 });

  const onSize = useCallback((p, s) => {
    if (p !== pathRef.current) return;
    setNat((n) =>
      n && n.path === p && n.w === s.w && n.h === s.h && n.exact === s.exact
        ? n
        : { path: p, w: s.w, h: s.h, exact: s.exact }
    );
  }, []);

  const step = useCallback(
    (delta) => {
      if (siblings.length < 2) return;
      const i = index < 0 ? 0 : (index + delta + siblings.length) % siblings.length;
      onNavigate(siblings[i].path);
    },
    [siblings, index, onNavigate]
  );

  // Slideshow.
  useEffect(() => {
    if (!playing) return;
    if (!many) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => step(1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [playing, many, step, path]);

  // Lightly preload the neighbours once the current image is in.
  const exact = !!natural?.exact;
  useEffect(() => {
    if (!exact || siblings.length < 2 || index < 0) return;
    const t = setTimeout(() => {
      preloadImage(siblings[(index + 1) % siblings.length].path);
      if (!playing) preloadImage(siblings[(index - 1 + siblings.length) % siblings.length].path);
    }, 250);
    return () => clearTimeout(t);
  }, [exact, siblings, index, playing]);

  const showInFinder = () => wm.open("finder", { path: dir, select: path });
  const download = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = stat?.name || "image";
    a.click();
  };

  useWindowKeys(windowId, (e) => {
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowDown") step(1);
    else if (k === "ArrowLeft" || k === "ArrowUp") step(-1);
    else if (k === "+" || k === "=") zoom.zoomBy(1.25);
    else if (k === "-" || k === "_") zoom.zoomBy(0.8);
    else if (k === "0") zoom.setFit();
    else if (k === "1") zoom.setActual();
    else if (k === "r" || k === "R") zoom.rotate(e.shiftKey ? -1 : 1);
    else if (k === " ") setPlaying((p) => !p);
    else if (k === "i" || k === "I") setInspector((v) => !v);
    else return;
    e.preventDefault();
  });

  const moreMenu = (e) =>
    contextMenu(e, [
      { label: "Zoom to Fit", shortcut: "0", checked: zoom.fit, onClick: zoom.setFit },
      { label: "Actual Size", shortcut: "1", onClick: zoom.setActual },
      { separator: true },
      { label: "Rotate Left", shortcut: "⇧R", onClick: () => zoom.rotate(-1) },
      { label: "Rotate Right", shortcut: "R", onClick: () => zoom.rotate(1) },
      { separator: true },
      many && { label: strip ? "Hide Thumbnails" : "Show Thumbnails", onClick: () => setStrip((v) => !v) },
      { label: inspector ? "Hide Inspector" : "Show Inspector", shortcut: "I", onClick: () => setInspector((v) => !v) },
      { separator: true },
      { label: "Set as Desktop Picture", onClick: () => setDesktopPicture(path) },
      { label: "Show in Finder", onClick: showInFinder },
      { label: "Download", onClick: download },
    ]);

  const dims = natural?.exact ? `${natural.w} × ${natural.h}` : null;
  const fade = { duration: reduceMotion ? 0 : playing ? 0.6 : 0.22, ease: "easeOut" };

  return (
    <>
      <div className="os-toolbar preview-toolbar" data-window-drag>
        {many && (
          <button
            className="os-icon-btn preview-hide-sm"
            title="Thumbnails"
            aria-label="Toggle thumbnails"
            aria-pressed={strip}
            onClick={() => setStrip((v) => !v)}
          >
            <LuPanelLeft size={16} />
          </button>
        )}
        <div className="preview-title">
          <span className="os-toolbar-title">{stat?.name}</span>
          <span className="preview-subtitle">
            {many && index >= 0 ? `${index + 1} of ${siblings.length}` : "Image"}
            {dims ? ` — ${dims}` : ""}
          </span>
        </div>
        <div className="os-toolbar-spacer" />
        <div className="preview-group">
          <button className="os-icon-btn" title="Zoom Out (−)" aria-label="Zoom out" onClick={() => zoom.zoomBy(0.8)}>
            <LuZoomOut size={16} />
          </button>
          <button
            className="preview-percent preview-hide-sm"
            title={zoom.fit ? "Actual Size (1)" : "Zoom to Fit (0)"}
            onClick={zoom.fit ? zoom.setActual : zoom.setFit}
          >
            {natural?.exact ? `${zoom.percent}%` : "--"}
          </button>
          <button className="os-icon-btn" title="Zoom In (+)" aria-label="Zoom in" onClick={() => zoom.zoomBy(1.25)}>
            <LuZoomIn size={16} />
          </button>
        </div>
        <button
          className="os-icon-btn preview-hide-md"
          title="Zoom to Fit (0)"
          aria-label="Zoom to fit"
          aria-pressed={zoom.fit}
          onClick={zoom.setFit}
        >
          <LuMaximize size={16} />
        </button>
        <button
          className="os-icon-btn preview-hide-md preview-actual"
          title="Actual Size (1)"
          aria-label="Actual size"
          onClick={zoom.setActual}
        >
          1:1
        </button>
        <button
          className="os-icon-btn preview-hide-md"
          title="Rotate Left (Shift+R)"
          aria-label="Rotate left"
          onClick={() => zoom.rotate(-1)}
        >
          <LuRotateCcw size={16} />
        </button>
        <button
          className="os-icon-btn preview-hide-sm"
          title="Rotate Right (R)"
          aria-label="Rotate right"
          onClick={() => zoom.rotate(1)}
        >
          <LuRotateCw size={16} />
        </button>
        {many && (
          <button
            className="os-icon-btn"
            title={playing ? "Pause Slideshow (Space)" : "Play Slideshow (Space)"}
            aria-label={playing ? "Pause slideshow" : "Play slideshow"}
            aria-pressed={playing}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <LuPause size={16} /> : <LuPlay size={16} />}
          </button>
        )}
        <button
          className="os-icon-btn preview-hide-md"
          title="Set as Desktop Picture"
          aria-label="Set as desktop picture"
          onClick={() => setDesktopPicture(path)}
        >
          <LuWallpaper size={16} />
        </button>
        <button
          className="os-icon-btn preview-hide-md"
          title="Inspector (I)"
          aria-label="Toggle inspector"
          aria-pressed={inspector}
          onClick={() => setInspector((v) => !v)}
        >
          <LuInfo size={16} />
        </button>
        <a
          className="os-icon-btn preview-hide-md"
          href={url}
          download={stat?.name}
          title="Download"
          aria-label="Download"
          draggable={false}
        >
          <LuDownload size={16} />
        </a>
        <button className="os-icon-btn preview-show-md" title="More" aria-label="More actions" onClick={moreMenu}>
          <LuEllipsis size={16} />
        </button>
      </div>

      <div className="preview-body" onContextMenu={moreMenu}>
        {many && strip && <Filmstrip items={siblings} current={path} onPick={onNavigate} />}
        <div className="preview-stage" ref={zoom.setStage} data-zoomed={!zoom.fit}>
          <AnimatePresence initial={false}>
            <MotionDiv
              key={path}
              className="preview-fade"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fade}
            >
              <ImageLayer path={path} layerRef={zoom.setLayer} onSize={onSize} />
            </MotionDiv>
          </AnimatePresence>
          {!natural && (
            <div className="preview-stage-loading">
              <span className="os-spinner" />
            </div>
          )}
          {many && (
            <>
              <button className="preview-nav preview-nav--prev" aria-label="Previous image" onClick={() => step(-1)}>
                <LuChevronLeft size={20} />
              </button>
              <button className="preview-nav preview-nav--next" aria-label="Next image" onClick={() => step(1)}>
                <LuChevronRight size={20} />
              </button>
            </>
          )}
          {playing && <div key={path} className="preview-slide-progress" />}
          {inspector && (
            <aside className="preview-inspector os-scroll os-selectable" aria-label="Inspector">
              <div className="preview-inspector-title">General</div>
              <dl>
                <dt>Name</dt>
                <dd>{stat?.name}</dd>
                <dt>Kind</dt>
                <dd>{(stat?.ext || "").toUpperCase()} image</dd>
                <dt>Dimensions</dt>
                <dd>{dims || "Loading…"}</dd>
                <dt>Size</dt>
                <dd>{formatSize(stat?.size)}</dd>
                <dt>Modified</dt>
                <dd>{formatDate(stat?.mtime)}</dd>
                <dt>Where</dt>
                <dd className="preview-inspector-path">{tilde(path)}</dd>
              </dl>
              <button className="os-btn preview-inspector-btn" onClick={showInFinder}>
                <LuFolderSearch size={14} /> Show in Finder
              </button>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
