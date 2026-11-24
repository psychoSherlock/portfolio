// Items for the desktop (wallpaper) context menu.
import {
  LuFilePlus,
  LuFolderPlus,
  LuImage,
  LuLayers,
  LuLayoutGrid,
  LuSettings,
  LuSquareTerminal,
} from "react-icons/lu";
import { DESKTOP } from "../fs";
import { settings } from "../settingsStore";
import { ui } from "../ui";
import { wm } from "../windowStore";
import { desk } from "./system/sysStore";
import { newDesktopFolder, newDesktopTextFile } from "./dock/deskState";

const SORTS = [
  ["name", "Name"],
  ["kind", "Kind"],
  ["date", "Date Modified"],
];

export const desktopMenu = () => [
  { label: "New Folder", icon: LuFolderPlus, onClick: newDesktopFolder },
  { label: "New Text File", icon: LuFilePlus, onClick: newDesktopTextFile },
  { separator: true },
  { label: "Clean Up", icon: LuLayoutGrid, onClick: () => desk.cleanUp() },
  {
    label: "Sort By",
    submenu: SORTS.map(([id, label]) => ({
      label,
      checked: desk.sort === id,
      onClick: () => desk.setSort(id),
    })),
  },
  {
    label: settings.showDesktopIcons ? "Hide Desktop Icons" : "Show Desktop Icons",
    onClick: () => settings.set({ showDesktopIcons: !settings.showDesktopIcons }),
  },
  { separator: true },
  { label: "Change Wallpaper…", icon: LuImage, onClick: () => wm.open("settings", { pane: "wallpaper" }) },
  { label: "Open Terminal Here", icon: LuSquareTerminal, onClick: () => wm.open("terminal", { cwd: DESKTOP }) },
  { label: "Mission Control", icon: LuLayers, shortcut: "F3", onClick: () => ui.setOverlay("missionControl") },
  { separator: true },
  { label: "System Settings…", icon: LuSettings, onClick: () => wm.open("settings") },
];
