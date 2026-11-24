// Control Center: radios, appearance toggles, display + sound sliders, accent and wallpaper.
import { useRef } from "react";
import { motion as Motion } from "framer-motion";
import {
  LuAccessibility,
  LuBluetooth,
  LuChevronRight,
  LuMoon,
  LuRadioTower,
  LuSun,
  LuSunDim,
  LuVolume,
  LuVolume1,
  LuVolume2,
  LuVolumeX,
  LuWifi,
  LuWifiOff,
  LuBlend,
} from "react-icons/lu";
import fs from "../../fs";
import { wm } from "../../windowStore";
import { ACCENTS, settings, useSettings } from "../../settingsStore";
import { ui } from "../../ui";
import { useDismiss, useOnline } from "./hooks";
import { useSys } from "./sysStore";
import Slider from "./Slider";

const BRIGHT_MIN = 0.3;

function Toggle({ on, icon, name, sub, onClick }) {
  return (
    <button type="button" className="sys-cc-row" aria-pressed={on} onClick={onClick}>
      <span className="sys-cc-dot">{icon}</span>
      <span className="sys-cc-txt">
        <span className="sys-cc-name">{name}</span>
        {sub && <span className="sys-cc-sub">{sub}</span>}
      </span>
    </button>
  );
}

function wallpaperThumb(wallpaper) {
  if (!wallpaper) return null;
  if (wallpaper.startsWith("/home/")) return fs.thumb(wallpaper) || fs.url(wallpaper);
  return wallpaper;
}

export default function ControlCenter({ reduceMotion }) {
  const ref = useRef(null);
  const close = () => ui.setOverlay(null);
  useDismiss(ref, close);

  const theme = useSettings((s) => s.theme);
  const reduce = useSettings((s) => s.reduceMotion);
  const transparency = useSettings((s) => s.transparency);
  const brightness = useSettings((s) => s.brightness);
  const volume = useSettings((s) => s.volume);
  const sound = useSettings((s) => s.sound);
  const accent = useSettings((s) => s.accent);
  const wallpaper = useSettings((s) => s.wallpaper);
  const { wifi, bluetooth, airdrop } = useSys();
  const online = useOnline();

  const vol = sound ? volume : 0;
  const VolIcon = vol === 0 ? LuVolumeX : vol < 0.34 ? LuVolume : vol < 0.67 ? LuVolume1 : LuVolume2;
  const thumb = wallpaperThumb(wallpaper);
  const wallName = wallpaper?.split("/").pop()?.replace(/\.[^.]+$/, "") || "Wallpaper";

  const openSettings = (pane) => {
    close();
    wm.open("settings", { pane });
  };

  return (
    <Motion.div
      ref={ref}
      className="sys-cc sys-card"
      role="dialog"
      aria-label="Control Center"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
      transition={reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 520, damping: 36, mass: 0.7 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="sys-cc-tile sys-cc-net">
        <Toggle
          on={wifi}
          icon={wifi ? <LuWifi /> : <LuWifiOff />}
          name="Wi-Fi"
          sub={!wifi ? "Off" : online ? "SherlockNet" : "No Internet"}
          onClick={() => useSys.setState({ wifi: !wifi })}
        />
        <Toggle
          on={bluetooth}
          icon={<LuBluetooth />}
          name="Bluetooth"
          sub={bluetooth ? "On" : "Off"}
          onClick={() => useSys.setState({ bluetooth: !bluetooth })}
        />
        <Toggle
          on={airdrop}
          icon={<LuRadioTower />}
          name="AirDrop"
          sub={airdrop ? "Contacts Only" : "Receiving Off"}
          onClick={() => useSys.setState({ airdrop: !airdrop })}
        />
      </div>

      <div className="sys-cc-stack">
        <div className="sys-cc-tile">
          <Toggle
            on={theme === "dark"}
            icon={theme === "dark" ? <LuMoon /> : <LuSun />}
            name="Dark Mode"
            sub={theme === "dark" ? "On" : "Off"}
            onClick={() => settings.set({ theme: theme === "dark" ? "light" : "dark" })}
          />
        </div>
        <div className="sys-cc-tile">
          <Toggle
            on={reduce}
            icon={<LuAccessibility />}
            name="Reduce Motion"
            sub={reduce ? "On" : "Off"}
            onClick={() => settings.set({ reduceMotion: !reduce })}
          />
        </div>
        <div className="sys-cc-tile">
          <Toggle
            on={!transparency}
            icon={<LuBlend />}
            name="Reduce Transparency"
            sub={transparency ? "Off" : "On"}
            onClick={() => settings.set({ transparency: !transparency })}
          />
        </div>
      </div>

      <div className="sys-cc-tile sys-cc-wide">
        <div className="sys-cc-title">Display</div>
        <Slider
          label="Brightness"
          icon={brightness < 0.65 ? <LuSunDim /> : <LuSun />}
          value={(brightness - BRIGHT_MIN) / (1 - BRIGHT_MIN)}
          onChange={(v) => settings.set({ brightness: Math.round((BRIGHT_MIN + v * (1 - BRIGHT_MIN)) * 100) / 100 })}
        />
      </div>

      <div className="sys-cc-tile sys-cc-wide">
        <div className="sys-cc-title">Sound</div>
        <div className="sys-slider-row">
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <Slider
              label="Volume"
              icon={<VolIcon />}
              value={vol}
              onChange={(v) => settings.set({ volume: Math.round(v * 100) / 100, sound: v > 0 })}
            />
          </div>
          <button
            type="button"
            className="sys-slider-mute"
            aria-label={sound ? "Mute" : "Unmute"}
            title={sound ? "Mute" : "Unmute"}
            onClick={() => settings.set(sound ? { sound: false } : { sound: true, volume: volume > 0 ? volume : 0.5 })}
          >
            {sound ? <LuVolume2 /> : <LuVolumeX />}
          </button>
        </div>
      </div>

      <div className="sys-cc-tile sys-cc-wide">
        <div className="sys-cc-title">Accent Color</div>
        <div className="sys-cc-swatches" role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              className="sys-cc-swatch"
              aria-checked={accent === c}
              aria-label={`Accent ${c}`}
              style={{ background: c, "--swatch": c }}
              onClick={() => settings.set({ accent: c })}
            />
          ))}
        </div>
      </div>

      <div className="sys-cc-tile sys-cc-wide sys-cc-tile--btn">
        <button type="button" className="sys-cc-wall" onClick={() => openSettings("wallpaper")}>
          {thumb ? (
            <img className="sys-cc-wall-thumb" src={thumb} alt="" loading="lazy" decoding="async" draggable={false} />
          ) : (
            <span className="sys-cc-wall-thumb" />
          )}
          <span className="sys-cc-txt">
            <span className="sys-cc-name">Wallpaper</span>
            <span className="sys-cc-sub">{wallName}</span>
          </span>
          <LuChevronRight className="sys-cc-chev" />
        </button>
      </div>
    </Motion.div>
  );
}
