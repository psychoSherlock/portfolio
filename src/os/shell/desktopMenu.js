// Items for the desktop background context menu. (stub — owned by the system-shell agent)
import fs, { DESKTOP } from "../fs";
import { wm } from "../windowStore";

export const desktopMenu = () => [
  { label: "New Folder", onClick: () => fs.mkdir(`${DESKTOP}/untitled folder`, { unique: true }) },
  { separator: true },
  { label: "Change Wallpaper…", onClick: () => wm.open("settings", { pane: "wallpaper" }) },
];
