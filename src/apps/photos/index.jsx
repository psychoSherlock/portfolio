// Photos — grid of every image under ~/Pictures with a folder sidebar.
import { memo, useMemo, useState } from "react";
import { LuImages, LuFolder } from "react-icons/lu";
import fs, { HOME, useFs } from "../../os/fs";
import { openPath } from "../../os/open";
import "./photos.css";

const ROOT = `${HOME}/Pictures`;

const Thumb = memo(function Thumb({ p }) {
  return (
    <button className="photos-thumb" title={p.name} onClick={() => openPath(p.path, { app: "preview" })}>
      <img src={fs.thumb(p.path)} alt={p.name} loading="lazy" decoding="async" draggable={false} />
    </button>
  );
});

export default function Photos() {
  useFs();
  const [album, setAlbum] = useState(ROOT);
  const all = fs.walk(ROOT).filter((f) => f.kind === "image" && fs.thumb(f.path));
  const albums = fs.list(ROOT).filter((d) => d.type === "dir");

  const photos = useMemo(
    () => (album === ROOT ? all : all.filter((f) => f.path.startsWith(album + "/"))).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [album, fs.getVersion()]
  );
  const count = (dir) => all.filter((f) => f.path.startsWith(dir + "/")).length;

  return (
    <div className="photos-root">
      <aside className="photos-side">
        <div className="photos-side-top" data-window-drag />
        <div className="photos-side-label">Library</div>
        <button className="photos-album" aria-pressed={album === ROOT} onClick={() => setAlbum(ROOT)}>
          <LuImages size={15} /> <span>All Photos</span>
          <em>{all.length}</em>
        </button>
        <div className="photos-side-label">Albums</div>
        {albums.map((a) => (
          <button key={a.path} className="photos-album" aria-pressed={album === a.path} onClick={() => setAlbum(a.path)}>
            <LuFolder size={15} /> <span>{a.name}</span>
            <em>{count(a.path)}</em>
          </button>
        ))}
      </aside>
      <div className="photos-main">
        <div className="os-toolbar" data-window-drag>
          <span className="os-toolbar-title">{album === ROOT ? "All Photos" : fs.stat(album)?.name}</span>
          <span className="photos-count">{photos.length} photos</span>
        </div>
        <div className="photos-grid os-scroll">
          {photos.map((p) => (
            <Thumb key={p.path} p={p} />
          ))}
          {!photos.length && <div className="photos-empty">No photos in this album.</div>}
        </div>
      </div>
    </div>
  );
}

