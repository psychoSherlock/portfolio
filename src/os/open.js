// "Open with default app" routing for filesystem paths and URLs.
import fs, { kindOf, TRASH } from "./fs";
import { wm } from "./windowStore";
import { notify } from "./ui";

/** Which app opens a given file kind. */
export const DEFAULT_APP = {
  dir: "finder",
  image: "preview",
  pdf: "preview",
  markdown: "textedit",
  text: "textedit",
  code: "textedit",
  audio: "music",
  video: "preview",
};

/** Open a URL inside the in-OS browser. */
export const openUrl = (url) => wm.open("safari", { url });

/** Open a URL in a real browser tab. */
export const openExternal = (url) =>
  window.open(url, "_blank", "noopener,noreferrer");

/** Open any filesystem path with its default app. Returns the window id (or null). */
export async function openPath(path, { app } = {}) {
  const st = fs.stat(path);
  if (!st) {
    notify({ title: "File not found", body: path });
    return null;
  }
  if (app) return wm.open(app, { path: st.path });
  if (st.type === "dir") return wm.open("finder", { path: st.path });

  if (st.path.startsWith(TRASH + "/")) {
    notify({ title: "Can't open item", body: `"${st.name}" is in the Trash. Put it back to open it.` });
    return null;
  }

  const kind = kindOf(st.name);
  if (kind === "link" || kind === "app") {
    try {
      const data = JSON.parse(await fs.readText(st.path));
      if (kind === "link" && data.url) return openUrl(data.url);
      if (kind === "app" && data.app) return wm.open(data.app, data.props || {});
    } catch {
      /* fall through to the editor */
    }
    return wm.open("textedit", { path: st.path });
  }
  const target = DEFAULT_APP[kind] || "textedit";
  return wm.open(target, { path: st.path });
}
