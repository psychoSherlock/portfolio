// Desktop root: wallpaper, menu bar, desktop icons, windows, dock and shell overlays.
import { useEffect } from "react";
import "./theme.css";
import fs from "./fs";
import { useWindows, wm } from "./windowStore";
import { useSettings, applySettings } from "./settingsStore";
import { contextMenu, ui } from "./ui";
import Window from "./Window";
import MenuBar from "./shell/MenuBar";
import Dock from "./shell/Dock";
import DesktopIcons from "./shell/DesktopIcons";
import DockOverlays from "./shell/DockOverlays";
import SystemOverlays from "./shell/SystemOverlays";
import { desktopMenu } from "./shell/desktopMenu";

function WindowLayer() {
  const windows = useWindows((s) => s.windows);
  const activeId = useWindows((s) => s.activeId);
  return (
    <div className="os-windows">
      <div id="os-snap-preview" data-show="false" />
      {windows.map((w) => (
        <Window key={w.id} win={w} active={w.id === activeId} />
      ))}
    </div>
  );
}

function Wallpaper() {
  const wallpaper = useSettings((s) => s.wallpaper);
  const fit = useSettings((s) => s.wallpaperFit);
  const brightness = useSettings((s) => s.brightness);
  const url = wallpaper?.startsWith("/home/") ? fs.url(wallpaper) : wallpaper;
  return (
    <div
      className="os-wallpaper"
      style={{
        backgroundImage: url ? `url("${url}")` : undefined,
        backgroundSize: fit,
        filter: brightness < 1 ? `brightness(${brightness})` : undefined,
      }}
      onPointerDown={() => {
        wm.blurAll();
        ui.hideContextMenu();
      }}
      onContextMenu={(e) => contextMenu(e, desktopMenu())}
    />
  );
}

export default function Desktop() {
  useEffect(() => {
    applySettings();
    return useSettings.subscribe(applySettings);
  }, []);

  // First visit: greet with the About Me window.
  useEffect(() => {
    if (useWindows.getState().windows.length === 0) wm.open("about");
  }, []);

  return (
    <div className="os-root" onContextMenu={(e) => e.preventDefault()}>
      <Wallpaper />
      <DesktopIcons />
      <WindowLayer />
      <MenuBar />
      <Dock />
      <DockOverlays />
      <SystemOverlays />
    </div>
  );
}
