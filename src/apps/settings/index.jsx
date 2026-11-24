// System Settings — Appearance, Wallpaper, Desktop & Dock, General, About.
import { useEffect, useMemo, useState } from "react";
import { LuPalette, LuImage, LuDock, LuSettings, LuInfo, LuTriangleAlert } from "react-icons/lu";
import fs, { HOME, useFs } from "../../os/fs";
import { ACCENTS, useSettings } from "../../os/settingsStore";
import { openUrl } from "../../os/open";
import { Group, Row, InfoRow, SwitchRow, Slider, Segmented, Swatches, ConfirmSheet } from "./controls";
import { GRADIENT_WALLPAPERS } from "./wallpapers";
import "./settings.css";

const PANES = [
  { id: "appearance", label: "Appearance", icon: LuPalette },
  { id: "wallpaper", label: "Wallpaper", icon: LuImage },
  { id: "dock", label: "Desktop & Dock", icon: LuDock },
  { id: "general", label: "General", icon: LuSettings },
  { id: "about", label: "About", icon: LuInfo },
];

function Appearance({ s }) {
  return (
    <>
      <Group title="Theme">
        <Row label="Appearance">
          <Segmented
            label="Theme"
            value={s.theme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(theme) => s.set({ theme })}
          />
        </Row>
        <Row label="Accent color">
          <Swatches label="Accent color" value={s.accent} colors={ACCENTS} onChange={(accent) => s.set({ accent })} />
        </Row>
      </Group>
      <Group title="Effects">
        <SwitchRow label="Transparency" description="Translucent window and menu backgrounds." checked={s.transparency} onChange={(transparency) => s.set({ transparency })} />
      </Group>
    </>
  );
}

function Wallpaper({ s }) {
  useFs();
  const dir = `${HOME}/Pictures/Wallpapers`;
  const pics = useMemo(
    () => fs.list(dir).filter((f) => f.kind === "image" && fs.thumb(f.path)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fs.getVersion()]
  );
  return (
    <>
      <Group title="Fit">
        <Row label="Picture fit">
          <Segmented
            label="Wallpaper fit"
            value={s.wallpaperFit}
            options={[
              { value: "cover", label: "Fill" },
              { value: "contain", label: "Fit" },
            ]}
            onChange={(wallpaperFit) => s.set({ wallpaperFit })}
          />
        </Row>
      </Group>
      <h3 className="settings-group-title">Pictures</h3>
      <div className="settings-wp-grid">
        {pics.map((p) => (
          <button key={p.path} className="settings-wp" aria-pressed={s.wallpaper === p.path} title={p.name} onClick={() => s.set({ wallpaper: p.path })}>
            <img src={fs.thumb(p.path)} alt={p.name} loading="lazy" decoding="async" draggable={false} />
          </button>
        ))}
      </div>
      <h3 className="settings-group-title">Dynamic</h3>
      <div className="settings-wp-grid">
        {GRADIENT_WALLPAPERS.map((g) => (
          <button key={g.id} className="settings-wp" aria-pressed={s.wallpaper === g.url} title={g.name} onClick={() => s.set({ wallpaper: g.url })}>
            <img src={g.url} alt={g.name} loading="lazy" decoding="async" draggable={false} />
          </button>
        ))}
      </div>
    </>
  );
}

function Dock({ s }) {
  return (
    <>
      <Group title="Dock">
        <Row label="Size" stacked>
          <Slider label="Dock size" min={36} max={80} step={1} value={s.dockSize} before="Small" after="Large" onChange={(dockSize) => s.set({ dockSize })} />
        </Row>
        <SwitchRow label="Magnification" checked={s.dockMagnify} onChange={(dockMagnify) => s.set({ dockMagnify })} />
        <SwitchRow label="Automatically hide and show the Dock" checked={s.dockAutoHide} onChange={(dockAutoHide) => s.set({ dockAutoHide })} />
      </Group>
      <Group title="Desktop">
        <SwitchRow label="Show items on desktop" checked={s.showDesktopIcons} onChange={(showDesktopIcons) => s.set({ showDesktopIcons })} />
      </Group>
    </>
  );
}

function General({ s, onReset }) {
  return (
    <>
      <Group title="Clock">
        <SwitchRow label="24-hour time" checked={s.clock24h} onChange={(clock24h) => s.set({ clock24h })} />
      </Group>
      <Group title="Startup & motion" footer="Skipping startup jumps straight to the desktop on the next visit.">
        <SwitchRow label="Skip boot animation" checked={s.skipBoot} onChange={(skipBoot) => s.set({ skipBoot })} />
        <SwitchRow label="Reduce motion" checked={s.reduceMotion} onChange={(reduceMotion) => s.set({ reduceMotion })} />
        <SwitchRow label="Sound effects" checked={s.sound} onChange={(sound) => s.set({ sound })} />
      </Group>
      <Group title="Reset">
        <Row label="Reset all settings" description="Restores every setting to its default.">
          <button className="os-btn settings-btn-danger" onClick={onReset}>
            Reset…
          </button>
        </Row>
      </Group>
    </>
  );
}

function About() {
  const nav = typeof navigator !== "undefined" ? navigator : {};
  return (
    <>
      <div className="settings-about-hero">
        <h2>SherlockOS</h2>
        <span>Version 4.0</span>
      </div>
      <Group title="This browser">
        <InfoRow label="Browser" value={(nav.userAgent || "").match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/)?.[0] || "Unknown"} />
        <InfoRow label="Platform" value={nav.userAgentData?.platform || nav.platform || "Unknown"} />
        <InfoRow label="Cores" value={nav.hardwareConcurrency || "Unknown"} />
        <InfoRow label="Language" value={nav.language || "Unknown"} />
      </Group>
      <Group title="Source">
        <Row label="Source code" description="github.com/psychoSherlock/portfolio">
          <button className="os-btn" onClick={() => openUrl("https://github.com/psychoSherlock/portfolio")}>
            Open
          </button>
        </Row>
      </Group>
    </>
  );
}

export default function Settings({ propsVersion, pane: paneProp }) {
  const s = useSettings();
  const [pane, setPane] = useState(PANES.some((p) => p.id === paneProp) ? paneProp : "appearance");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (PANES.some((p) => p.id === paneProp)) setPane(paneProp);
  }, [paneProp, propsVersion]);

  const current = PANES.find((p) => p.id === pane);

  return (
    <div className="settings-root">
      <nav className="settings-side" aria-label="Settings panes">
        <div className="settings-side-top" data-window-drag />
        {PANES.map((p) => (
          <button key={p.id} className="settings-nav" aria-current={p.id === pane} onClick={() => setPane(p.id)}>
            <p.icon size={16} /> <span>{p.label}</span>
          </button>
        ))}
      </nav>
      <main className="settings-main">
        <div className="os-toolbar settings-toolbar" data-window-drag>
          <span className="os-toolbar-title">{current.label}</span>
        </div>
        <div className="settings-pane os-scroll">
          {pane === "appearance" && <Appearance s={s} />}
          {pane === "wallpaper" && <Wallpaper s={s} />}
          {pane === "dock" && <Dock s={s} />}
          {pane === "general" && <General s={s} onReset={() => setConfirm(true)} />}
          {pane === "about" && <About />}
        </div>
      </main>
      <ConfirmSheet
        open={confirm}
        icon={<LuTriangleAlert size={28} />}
        title="Reset all settings?"
        message="Theme, wallpaper, dock and every other preference will return to their defaults."
        confirmLabel="Reset"
        danger
        reduceMotion={s.reduceMotion}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          s.reset();
          setConfirm(false);
        }}
      />
    </div>
  );
}
