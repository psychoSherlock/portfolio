// Music — SomaFM radio through a module-level Audio element (keeps playing when the window closes).
import { useEffect, useState, useSyncExternalStore } from "react";
import { LuPlay, LuPause, LuRadio, LuVolume2, LuVolumeX } from "react-icons/lu";
import { useSettings } from "../../os/settingsStore";
import { openExternal } from "../../os/open";
import "./music.css";

const STATIONS = [
  { id: "defcon", name: "DEF CON Radio", desc: "Music for hacking.", url: "https://ice1.somafm.com/defcon-128-mp3" },
  { id: "groovesalad", name: "Groove Salad", desc: "Ambient/downtempo beats.", url: "https://ice1.somafm.com/groovesalad-128-mp3" },
  { id: "dronezone", name: "Drone Zone", desc: "Atmospheric textures.", url: "https://ice1.somafm.com/dronezone-128-mp3" },
  { id: "deepspaceone", name: "Deep Space One", desc: "Deep ambient electronic.", url: "https://ice1.somafm.com/deepspaceone-128-mp3" },
  { id: "secretagent", name: "Secret Agent", desc: "Lounge for spies.", url: "https://ice1.somafm.com/secretagent-128-mp3" },
  { id: "lush", name: "Lush", desc: "Sensual, mellow vocals.", url: "https://ice1.somafm.com/lush-128-mp3" },
];

// ---- module-level player ----
let audio = null;
const player = { id: null, playing: false, loading: false, error: false };
let snap = { ...player };
const subs = new Set();
const emit = () => {
  snap = { ...player };
  subs.forEach((f) => f());
};
const subscribe = (f) => (subs.add(f), () => subs.delete(f));

function getAudio() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "none";
    audio.addEventListener("playing", () => Object.assign(player, { playing: true, loading: false, error: false }) && emit());
    audio.addEventListener("pause", () => Object.assign(player, { playing: false }) && emit());
    audio.addEventListener("waiting", () => Object.assign(player, { loading: true }) && emit());
    audio.addEventListener("error", () => Object.assign(player, { playing: false, loading: false, error: true }) && emit());
  }
  return audio;
}

function applyVolume() {
  const { volume, sound } = useSettings.getState();
  if (audio) {
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.muted = !sound;
  }
}

function toggle(st) {
  const a = getAudio();
  applyVolume();
  if (player.id === st.id && player.playing) {
    a.pause();
    return;
  }
  if (player.id !== st.id) {
    a.src = st.url;
    player.id = st.id;
  }
  Object.assign(player, { loading: true, error: false });
  emit();
  a.play().catch(() => {
    Object.assign(player, { playing: false, loading: false, error: true });
    emit();
  });
}

export default function Music() {
  const p = useSyncExternalStore(subscribe, () => snap);
  const volume = useSettings((s) => s.volume);
  const sound = useSettings((s) => s.sound);
  const [, force] = useState(0);

  useEffect(() => {
    applyVolume();
    force((n) => n + 1);
  }, [volume, sound]);

  const current = STATIONS.find((s) => s.id === p.id);

  return (
    <div className="music-root">
      <div className="os-toolbar" data-window-drag>
        <span className="os-toolbar-title">Music</span>
        <div className="os-toolbar-spacer" />
        <button
          className="os-icon-btn"
          aria-label={sound ? "Mute" : "Unmute"}
          title={sound ? "Mute" : "Unmute"}
          onClick={() => useSettings.getState().set({ sound: !sound })}
        >
          {sound ? <LuVolume2 size={16} /> : <LuVolumeX size={16} />}
        </button>
        <input
          className="music-volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          aria-label="Volume"
          style={{ "--pct": `${volume * 100}%` }}
          onChange={(e) => useSettings.getState().set({ volume: Number(e.target.value) })}
        />
      </div>
      <div className="music-now">
        <LuRadio size={22} />
        <div>
          <b>{current ? current.name : "Radio"}</b>
          <span>{p.error ? "Stream unavailable" : p.loading ? "Connecting…" : p.playing ? "Playing live" : current ? "Paused" : "Pick a station"}</span>
        </div>
      </div>
      <ul className="music-list os-scroll">
        {STATIONS.map((s) => {
          const active = p.id === s.id && p.playing;
          return (
            <li key={s.id}>
              <button className="music-station" aria-pressed={p.id === s.id} onClick={() => toggle(s)}>
                <span className="music-play">{active ? <LuPause size={16} /> : <LuPlay size={16} />}</span>
                <span className="music-station-text">
                  <b>{s.name}</b>
                  <small>{s.desc}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button className="music-credit" onClick={() => openExternal("https://somafm.com")}>
        Streams by SomaFM — listener-supported radio
      </button>
    </div>
  );
}
