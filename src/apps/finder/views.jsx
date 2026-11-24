// The four Finder views (icons, list, columns, gallery) + the inline rename field.
// Every item element carries data-path (selection hit-testing / reveal) and folders carry
// data-finder-drop (drag & drop target). Handlers come in through a stable `h` object.
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { LuChevronDown, LuChevronRight, LuChevronUp } from "react-icons/lu";
import fs, { TRASH, dirname, formatSize, tilde } from "../../os/fs";
import FileIcon from "./FileIcon";
import Preview from "./Preview";
import { ancestors, columnBase, countLabel, defaultAppName, folderInfo, formatDate, kindLabel, sortItems } from "./util";

const sameItem = (a, b) =>
  a === b ||
  (a.path === b.path &&
    a.name === b.name &&
    a.mtime === b.mtime &&
    a.size === b.size &&
    a.type === b.type &&
    a.trashedFrom === b.trashedFrom);

/** Shallow prop compare, with value semantics for the fs `item`. */
function propsEqual(a, b) {
  for (const k in a) {
    if (k === "item") {
      if (!sameItem(a.item, b.item)) return false;
    } else if (a[k] !== b[k]) return false;
  }
  return true;
}

const flag = (v) => (v ? "" : undefined);

// ---- rename -----------------------------------------------------------------
export function RenameField({ item, h, className = "" }) {
  const ref = useRef(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const dot = item.type === "file" ? item.name.lastIndexOf(".") : -1;
    el.setSelectionRange(0, dot > 0 ? dot : item.name.length);
  }, [item.name, item.type]);
  const finish = (commit, viaKey) => {
    if (done.current) return;
    done.current = true;
    if (commit) h.renameCommit(item.path, ref.current?.value ?? item.name, viaKey);
    else h.renameCancel(viaKey);
  };
  const stop = (e) => e.stopPropagation();
  return (
    <input
      ref={ref}
      className={`finder-rename ${className}`}
      defaultValue={item.name}
      spellCheck={false}
      autoComplete="off"
      aria-label="New name"
      data-no-drag
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true, true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false, true);
        }
      }}
      onBlur={() => finish(true, false)}
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
    />
  );
}

function Empty({ children }) {
  return <div className="finder-empty">{children}</div>;
}

// ---- icon view ----------------------------------------------------------------
const IconCell = memo(function IconCell({ item, selected, renaming, cut, size, sub, h }) {
  const dir = item.type === "dir";
  return (
    <div
      className="finder-cell"
      role="option"
      aria-selected={selected}
      data-path={item.path}
      data-finder-drop={dir ? item.path : undefined}
      data-selected={flag(selected)}
      data-cut={flag(cut)}
      data-no-drag
      title={sub ? tilde(item.path) : item.name}
      onPointerDown={(e) => h.pointerDown(e, item)}
      onClick={(e) => h.click(e, item)}
      onDoubleClick={(e) => h.doubleClick(e, item)}
      onContextMenu={(e) => h.contextMenu(e, item)}
    >
      <div className="finder-cell-icon" style={{ width: size + 8, height: size + 8 }}>
        <FileIcon item={item} size={size} />
      </div>
      {renaming ? (
        <RenameField item={item} h={h} className="finder-rename--cell" />
      ) : (
        <div className="finder-cell-label">
          <span>{item.name}</span>
        </div>
      )}
      {sub ? <div className="finder-cell-sub">{sub}</div> : null}
    </div>
  );
}, propsEqual);

export function IconView({ items, selectedSet, renaming, cutSet, iconSize, searching, dropDir, empty, h }) {
  return (
    <div
      className="finder-view finder-icons os-scroll"
      role="listbox"
      data-rubber
      aria-multiselectable="true"
      data-finder-drop={dropDir || undefined}
      onPointerDown={h.backgroundPointerDown}
      onContextMenu={h.backgroundMenu}
    >
      <div className="finder-grid" style={{ "--finder-icon": `${iconSize}px` }}>
        {items.map((item) => (
          <IconCell
            key={item.path}
            item={item}
            selected={selectedSet.has(item.path)}
            renaming={renaming === item.path}
            cut={cutSet.has(item.path)}
            size={iconSize}
            sub={searching ? tilde(dirname(item.path)) : null}
            h={h}
          />
        ))}
      </div>
      {items.length === 0 ? <Empty>{empty}</Empty> : null}
    </div>
  );
}

// ---- list view ------------------------------------------------------------------
const ListRow = memo(function ListRow({ item, selected, renaming, cut, where, h }) {
  const dir = item.type === "dir";
  return (
    <div
      className="finder-row"
      role="option"
      aria-selected={selected}
      data-path={item.path}
      data-finder-drop={dir ? item.path : undefined}
      data-selected={flag(selected)}
      data-cut={flag(cut)}
      data-no-drag
      title={where ? tilde(item.path) : undefined}
      onPointerDown={(e) => h.pointerDown(e, item)}
      onClick={(e) => h.click(e, item)}
      onDoubleClick={(e) => h.doubleClick(e, item)}
      onContextMenu={(e) => h.contextMenu(e, item)}
    >
      <div className="finder-c finder-c-name">
        <FileIcon item={item} size={16} detail={false} />
        {renaming ? (
          <RenameField item={item} h={h} className="finder-rename--row" />
        ) : (
          <span className="finder-c-text">{item.name}</span>
        )}
      </div>
      {where ? <div className="finder-c finder-c-where">{tilde(dirname(item.path))}</div> : null}
      <div className="finder-c finder-c-date">{formatDate(item.mtime)}</div>
      <div className="finder-c finder-c-size">{dir ? "--" : formatSize(item.size)}</div>
      <div className="finder-c finder-c-kind">{kindLabel(item)}</div>
    </div>
  );
}, propsEqual);

const LIST_COLS = [
  { id: "name", label: "Name", cls: "finder-c-name" },
  { id: "where", label: "Where", cls: "finder-c-where", noSort: true },
  { id: "date", label: "Date Modified", cls: "finder-c-date" },
  { id: "size", label: "Size", cls: "finder-c-size" },
  { id: "kind", label: "Kind", cls: "finder-c-kind" },
];

export function ListView({ items, selectedSet, renaming, cutSet, searching, sort, onSort, dropDir, empty, h }) {
  const cols = searching ? LIST_COLS : LIST_COLS.filter((c) => c.id !== "where");
  return (
    <div
      className={`finder-view finder-list os-scroll${searching ? " finder-list--where" : ""}`}
      data-rubber
      data-finder-drop={dropDir || undefined}
      onPointerDown={h.backgroundPointerDown}
      onContextMenu={h.backgroundMenu}
    >
      <div className="finder-list-head" role="row">
        {cols.map((c) => {
          const active = sort.key === c.id;
          const Chev = sort.dir === "desc" ? LuChevronDown : LuChevronUp;
          return c.noSort ? (
            <div key={c.id} className={`finder-lh ${c.cls}`} role="columnheader">
              {c.label}
            </div>
          ) : (
            <button
              key={c.id}
              type="button"
              className={`finder-lh ${c.cls}`}
              role="columnheader"
              aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
              data-active={flag(active)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSort(c.id)}
            >
              <span>{c.label}</span>
              {active ? <Chev className="finder-lh-chev" /> : null}
            </button>
          );
        })}
      </div>
      <div className="finder-list-body" role="listbox" aria-multiselectable="true">
        {items.map((item) => (
          <ListRow
            key={item.path}
            item={item}
            selected={selectedSet.has(item.path)}
            renaming={renaming === item.path}
            cut={cutSet.has(item.path)}
            where={searching}
            h={h}
          />
        ))}
      </div>
      {items.length === 0 ? <Empty>{empty}</Empty> : null}
    </div>
  );
}

// ---- column view ---------------------------------------------------------------
const ColumnRow = memo(function ColumnRow({ item, selected, open, renaming, cut, h }) {
  const dir = item.type === "dir";
  return (
    <div
      className="finder-crow"
      role="option"
      aria-selected={selected}
      data-path={item.path}
      data-finder-drop={dir ? item.path : undefined}
      data-selected={flag(selected)}
      data-open={flag(open)}
      data-cut={flag(cut)}
      data-no-drag
      onPointerDown={(e) => h.pointerDown(e, item)}
      onClick={(e) => h.click(e, item)}
      onDoubleClick={(e) => h.doubleClick(e, item)}
      onContextMenu={(e) => h.contextMenu(e, item)}
    >
      <FileIcon item={item} size={16} detail={false} />
      {renaming ? (
        <RenameField item={item} h={h} className="finder-rename--row" />
      ) : (
        <span className="finder-crow-name">{item.name}</span>
      )}
      {dir ? <LuChevronRight className="finder-crow-chev" /> : null}
    </div>
  );
}, propsEqual);

function Column({ dir, items, current, openChild, selectedSet, renaming, cutSet, h }) {
  return (
    <div
      className="finder-col os-scroll"
      role="listbox"
      aria-label={dir}
      data-finder-drop={dir}
      data-current={flag(current)}
      onPointerDown={(e) => {
        if (e.button === 0 && !e.target.closest("[data-path]")) h.columnBackground(e, dir);
      }}
      onContextMenu={(e) => {
        if (!e.target.closest("[data-path]")) h.backgroundMenu(e, dir);
      }}
    >
      {items.length === 0 ? (
        <div className="finder-col-empty">{dir === TRASH ? "Trash is empty" : "Empty folder"}</div>
      ) : (
        items.map((item) => (
          <ColumnRow
            key={item.path}
            item={item}
            selected={current ? selectedSet.has(item.path) : false}
            open={item.path === openChild}
            renaming={renaming === item.path}
            cut={cutSet.has(item.path)}
            h={h}
          />
        ))
      )}
    </div>
  );
}

function FileMeta({ item, fsv }) {
  const info = useMemo(() => {
    void fsv;
    return item.type === "dir" ? folderInfo(item.path) : null;
  }, [item.path, item.type, fsv]);
  const app = defaultAppName(item);
  return (
    <>
      <div className="finder-meta-name">{item.name}</div>
      <div className="finder-meta-sub">
        {kindLabel(item)} · {info ? `${countLabel(info.count)}, ${formatSize(info.size)}` : formatSize(item.size)}
      </div>
      <dl className="finder-meta">
        <dt>Modified</dt>
        <dd>{formatDate(item.mtime)}</dd>
        <dt>Where</dt>
        <dd>{tilde(dirname(item.path))}</dd>
        {app ? (
          <>
            <dt>Opens with</dt>
            <dd>{app}</dd>
          </>
        ) : null}
      </dl>
    </>
  );
}

export function ColumnView({ cwd, items, sort, selectedSet, single, renaming, cutSet, fsv, h }) {
  const scrollRef = useRef(null);
  const columns = useMemo(() => {
    void fsv;
    const base = columnBase(cwd);
    const chain = ancestors(cwd).filter((p) => p === base || p.startsWith(base === "/" ? "/" : base + "/"));
    return chain.map((dir, i) => ({
      dir,
      items: dir === cwd ? items : sortItems(fs.list(dir, { hidden: dir === TRASH }), sort),
      openChild: chain[i + 1] ?? null,
    }));
  }, [cwd, items, sort, fsv]);
  const childDir = single?.type === "dir" ? single.path : null;
  const childItems = useMemo(() => {
    void fsv;
    return childDir ? sortItems(fs.list(childDir), sort) : null;
  }, [childDir, sort, fsv]);
  const file = single && single.type === "file" ? single : null;

  // keep the deepest column in view
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [cwd, childDir, file?.path]);

  return (
    <div className="finder-view finder-columns os-scroll" ref={scrollRef}>
      {columns.map((c) => (
        <Column
          key={c.dir}
          dir={c.dir}
          items={c.items}
          current={c.dir === cwd}
          openChild={c.dir === cwd ? childDir : c.openChild}
          selectedSet={selectedSet}
          renaming={renaming}
          cutSet={cutSet}
          h={h}
        />
      ))}
      {childDir ? (
        <Column
          key={`child:${childDir}`}
          dir={childDir}
          items={childItems}
          current={false}
          openChild={null}
          selectedSet={selectedSet}
          renaming={renaming}
          cutSet={cutSet}
          h={h}
        />
      ) : null}
      {file ? (
        <div className="finder-col finder-col--preview os-scroll" key="preview">
          <div className="finder-col-stage">
            <Preview item={file} mode="compact" version={fsv} />
          </div>
          <FileMeta item={file} fsv={fsv} />
          <button type="button" className="os-btn finder-col-open" onClick={() => h.open(file)}>
            Open
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---- gallery view ----------------------------------------------------------------
const GalleryThumb = memo(function GalleryThumb({ item, selected, cut, h }) {
  return (
    <div
      className="finder-gthumb"
      role="option"
      aria-selected={selected}
      title={item.name}
      data-path={item.path}
      data-finder-drop={item.type === "dir" ? item.path : undefined}
      data-selected={flag(selected)}
      data-cut={flag(cut)}
      data-no-drag
      onPointerDown={(e) => h.pointerDown(e, item)}
      onClick={(e) => h.click(e, item)}
      onDoubleClick={(e) => h.doubleClick(e, item)}
      onContextMenu={(e) => h.contextMenu(e, item)}
    >
      <FileIcon item={item} size={52} />
    </div>
  );
}, propsEqual);

export function GalleryView({ items, selectedSet, leadItem, renaming, cutSet, dropDir, empty, fsv, h }) {
  return (
    <div
      className="finder-view finder-gallery"
      data-finder-drop={dropDir || undefined}
      onContextMenu={h.backgroundMenu}
    >
      <div className="finder-gallery-stage">
        {leadItem ? (
          <Preview key={leadItem.path} item={leadItem} mode="full" version={fsv} />
        ) : (
          <Empty>{items.length ? "No selection" : empty}</Empty>
        )}
      </div>
      {leadItem ? (
        <div className="finder-gallery-caption">
          {renaming === leadItem.path ? (
            <RenameField item={leadItem} h={h} className="finder-rename--caption" />
          ) : (
            <span className="finder-gallery-name">{leadItem.name}</span>
          )}
          <span className="finder-gallery-meta">
            {kindLabel(leadItem)}
            {leadItem.type === "file" ? ` · ${formatSize(leadItem.size)}` : ""} · {formatDate(leadItem.mtime)}
          </span>
        </div>
      ) : null}
      {items.length ? (
        <div className="finder-gallery-strip os-scroll" role="listbox">
          {items.map((item) => (
            <GalleryThumb
              key={item.path}
              item={item}
              selected={selectedSet.has(item.path)}
              cut={cutSet.has(item.path)}
              h={h}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
