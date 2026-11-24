// Boot splash: systemd-style log -> Red Dead gunfire video/audio -> logo -> fade into the desktop.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Plymouth.css";
import gunfireAudio from "../assets/other/gunfire_audio.m4a";
import gunfireVideo from "../assets/other/gunfire_video.webm";
import rdrLogo from "../assets/images/cat_rdr_logo.png";
import fs from "../os/fs";
import { useSettings } from "../os/settingsStore";

/** sessionStorage flag: the desktop was reached in this tab, so later visits skip the boot. */
const BOOTED_KEY = "sherlockos.booted";
function markBooted() {
  try {
    sessionStorage.setItem(BOOTED_KEY, "1");
  } catch {
    /* storage unavailable: the boot sequence simply replays next time */
  }
}

const MAX_WAIT_MS = 6000; // hard cap on waiting for media before the splash continues without it
const VIDEO_MS = 3800; // gunfire clip length
const AUDIO_MS = 8300; // the music is over by then (the file ends in ~2s of silence)
const LOGO_HOLD_MS = 1800;
const KEY_GRACE_MS = 450; // ignore the Enter press that brought us here from GRUB

// `wait` ties a line to a real resource: it shows as a running start job until that resource
// is ready (or failed / timed out).
const BOOT_LOG = [
  { tag: "none", text: "Welcome to SherlockOS 2.0 (Baker Street)!", d: 260, bold: true },
  { tag: "ok", text: "Created slice system-portfolio.slice.", d: 90 },
  { tag: "ok", text: "Listening on Journal Socket.", d: 70 },
  { tag: "ok", text: "Started Journal Service.", d: 110 },
  { tag: "none", text: "Mounting /home/sherlock...", d: 200 },
  { tag: "ok", text: "Mounted /home/sherlock.", d: 90 },
  { tag: "ok", text: "Reached target Local File Systems.", d: 120 },
  { tag: "info", text: "Loading exploit database... just kidding.", d: 230 },
  { tag: "ok", text: "Started Network Manager.", d: 100 },
  { tag: "ok", text: "Reached target Network is Online.", d: 90 },
  { tag: "ok", text: "Started Load Splash Artwork.", d: 80, wait: "logo" },
  { tag: "ok", text: "Started Wallpaper Decode Service.", d: 90, wait: "wallpaper" },
  { tag: "ok", text: "Started Sherlock Deduction Engine.", d: 150 },
  { tag: "ok", text: "Started Gunfire Video Service.", d: 100, wait: "video" },
  { tag: "ok", text: "Started Gunfire Sound Service.", d: 100, wait: "audio" },
  { tag: "ok", text: "Started CTF Flag Sanitizer.", d: 80 },
  { tag: "info", text: "Elementary: no anomalies found in the boot evidence.", d: 170 },
  { tag: "ok", text: "Reached target Multi-User System.", d: 110 },
  { tag: "none", text: "Starting Show Plymouth Boot Screen...", d: 180 },
  { tag: "ok", text: "Reached target Graphical Interface.", d: 320 },
];
const LOG_SHARE = 55; // % of the progress bar covered by the log phase

const TAG_LABEL = {
  ok: "[  OK  ]",
  info: "[ INFO ]",
  wait: "[ **** ]",
  fail: "[FAILED]",
  time: "[ TIME ]",
  skip: "[ SKIP ]",
};

const rand = (a, b) => a + Math.random() * (b - a);

/** Rising embers on a canvas: ~120 additive sprites, DPR aware, paused while the tab is hidden. */
function Embers() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;

    // Pre-rendered glow sprites: one drawImage per particle instead of a gradient per frame.
    const sprites = ["255,84,18", "255,146,36", "255,204,108"].map((rgb) => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,250,225,1)");
      grad.addColorStop(0.16, `rgba(${rgb},0.95)`);
      grad.addColorStop(0.48, `rgba(${rgb},0.26)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return c;
    });

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;

    const spawn = (p, initial) => {
      p.x = rand(0, w);
      p.y = initial ? rand(h * 0.3, h) : h + rand(4, 40);
      p.vy = -rand(0.07, 0.22) * h;
      p.vx = rand(-14, 14);
      p.size = rand(1.2, 3.4);
      p.max = rand(2.6, 6.5);
      p.life = initial ? rand(0, p.max * 0.7) : 0;
      p.sway = rand(8, 36);
      p.freq = rand(0.6, 1.9);
      p.phase = rand(0, Math.PI * 2);
      p.sprite = sprites[Math.floor(Math.random() * sprites.length)];
    };
    const particles = Array.from({ length: 120 }, () => ({}));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of particles) {
        p.life += dt;
        if (p.life >= p.max || p.y < -24) spawn(p, false);
        p.y += p.vy * dt;
        p.x += (p.vx + Math.cos(p.life * p.freq + p.phase) * p.sway) * dt;
        const k = p.life / p.max;
        const fade = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
        const flicker = 0.74 + 0.26 * Math.sin(now * 0.011 + p.phase * 7);
        ctx.globalAlpha = Math.max(0, fade * flicker);
        const d = p.size * (1 - 0.45 * k) * 8;
        ctx.drawImage(p.sprite, p.x - d / 2, p.y - d / 2, d, d);
      }
    };

    const start = () => {
      if (raf || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    particles.forEach((p) => spawn(p, true));
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="ply-embers" aria-hidden="true" />;
}

export default function Plymouth() {
  const navigate = useNavigate();
  // Settings are read once: changing them mid-splash is not possible anyway.
  const [prefs] = useState(() => {
    const s = useSettings.getState();
    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const volume = Math.min(1, Math.max(0, Number(s.volume ?? 0.6)));
    return {
      sound: s.sound !== false && volume > 0,
      volume,
      reduceMotion: Boolean(s.reduceMotion) || prefersReduced,
      wallpaper: s.wallpaper,
    };
  });

  const [phase, setPhase] = useState("log"); // log -> (prompt) -> play -> logo
  const [leaving, setLeaving] = useState(false);
  const [lines, setLines] = useState([]);
  const [percent, setPercent] = useState(0);
  const [promptLeft, setPromptLeft] = useState(3);

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const logRef = useRef(null);
  const api = useRef({ skip() {}, answer() {} });

  // The whole timeline lives in one effect so a single cleanup tears everything down
  // (and StrictMode's mount -> unmount -> mount replays it from scratch without leaks).
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    const t0 = performance.now();
    let alive = true;
    let finished = false;
    let current = "log";
    let audioOn = false;
    const timers = new Set();
    const intervals = new Set();
    const cleanups = [];

    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (alive) fn();
      }, ms);
      timers.add(id);
    };
    const every = (fn, ms) => {
      const id = setInterval(() => alive && fn(), ms);
      intervals.add(id);
      return id;
    };
    const stopEvery = (id) => {
      clearInterval(id);
      intervals.delete(id);
    };
    const on = (target, type, fn) => {
      target.addEventListener(type, fn);
      cleanups.push(() => target.removeEventListener(type, fn));
    };
    const enter = (next) => {
      current = next;
      setPhase(next);
    };

    setPhase("log");
    setLeaving(false);
    setLines([]);
    setPercent(0);

    // ---- resource preloading: null = pending, then "ok" | "fail" | "skip" ----
    const ready = { video: null, audio: prefs.sound ? null : "skip", logo: null, wallpaper: null };
    const settle = (key, value) => {
      if (ready[key] == null) ready[key] = value;
    };
    const watchMedia = (el, key) => {
      if (!el) return settle(key, "skip");
      on(el, "canplaythrough", () => settle(key, "ok"));
      on(el, "error", () => settle(key, "fail"));
      if (el.error) settle(key, "fail");
      else if (el.readyState >= 4) settle(key, "ok"); // already buffered (cache / remount)
    };
    const watchImage = (key, url) => {
      if (!url) return settle(key, "skip");
      const img = new Image();
      img.decoding = "async";
      img.onload = () => settle(key, "ok");
      img.onerror = () => settle(key, "fail");
      img.src = url; // handlers first: a cached image can finish synchronously
      cleanups.push(() => {
        img.onload = img.onerror = null;
      });
    };
    if (video) {
      video.muted = true; // React does not reliably reflect the `muted` attribute
      video.defaultMuted = true;
    }
    watchMedia(video, "video");
    if (prefs.sound) watchMedia(audio, "audio");
    watchImage("logo", rdrLogo);
    const wp = prefs.wallpaper;
    watchImage(
      "wallpaper",
      typeof wp === "string" ? fs.url(wp) || (/^(https?:|data:|blob:)/.test(wp) ? wp : null) : null
    );

    // ---- leaving ----
    const finish = (fast = false) => {
      if (finished) return;
      finished = true;
      markBooted();
      setLeaving(true);
      setPercent(100);
      const ms = prefs.reduceMotion ? 120 : fast ? 260 : 620;
      if (audio && !audio.paused) {
        const from = audio.volume;
        const started = performance.now();
        every(() => {
          const k = Math.min(1, (performance.now() - started) / ms);
          audio.volume = Math.max(0, from * (1 - k));
        }, 40);
      }
      later(() => navigate("/desktop", { replace: true }), ms);
    };

    // ---- playback ----
    const toLogo = () => {
      if (current !== "play") return;
      enter("logo");
      video?.pause();
    };
    const startPlayback = () => {
      const hasVideo = ready.video === "ok" && video;
      const total = audioOn ? AUDIO_MS : (hasVideo ? VIDEO_MS : 0) + LOGO_HOLD_MS;
      const started = performance.now();
      enter("play");
      every(() => {
        if (finished) return;
        const k = Math.min(1, (performance.now() - started) / total);
        setPercent(Math.round(LOG_SHARE + (100 - LOG_SHARE) * k));
      }, 100);
      later(() => finish(), total);

      if (!hasVideo) return toLogo();
      on(video, "ended", toLogo);
      later(toLogo, VIDEO_MS + 900); // a stalled clip can never hold the logo back
      try {
        video.currentTime = 0;
      } catch {
        /* not seekable yet: plays from wherever it is */
      }
      Promise.resolve()
        .then(() => video.play())
        .catch(() => alive && toLogo());
    };

    let promptTimer = 0;
    const answer = (yes) => {
      if (current !== "prompt") return;
      stopEvery(promptTimer);
      if (yes && audio) {
        // Called from a key/click handler, so this play() carries the user gesture.
        audioOn = true;
        audio.currentTime = 0;
        audio.volume = prefs.volume;
        audio.play().catch(() => {
          // Still refused: do not sit on the logo for the length of a silent soundtrack.
          if (alive) later(() => finish(), VIDEO_MS + LOGO_HOLD_MS);
        });
      }
      startPlayback();
    };
    const askForSound = () => {
      let left = 3;
      setPromptLeft(left);
      enter("prompt");
      promptTimer = every(() => {
        left -= 1;
        if (left <= 0) answer(false);
        else setPromptLeft(left);
      }, 1000);
    };
    const begin = () => {
      if (ready.audio !== "ok" || !audio) return startPlayback();
      audio.volume = prefs.volume;
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      Promise.resolve()
        .then(() => audio.play())
        .then(
          () => {
            if (!alive) return audio.pause();
            audioOn = true;
            startPlayback();
          },
          () => alive && askForSound() // autoplay policy: needs a user gesture
        );
    };

    // ---- boot log runner ----
    let index = 0;
    const put = (id, line) =>
      setLines((prev) => {
        const next = prev.filter((l) => l.id !== id);
        next.push({ id, ...line });
        return next;
      });
    const step = () => {
      const line = BOOT_LOG[index];
      let { tag, text } = line;
      if (line.wait) {
        const state = ready[line.wait];
        const expired = performance.now() - t0 > MAX_WAIT_MS;
        if (state == null && !expired) {
          put(index, { tag: "wait", text: `A start job is running for ${text.replace(/^Started /, "").replace(/\.$/, "")}...` });
          later(step, 90);
          return;
        }
        if (state == null) {
          ready[line.wait] = "fail";
          tag = "time";
          text = `Timed out waiting for ${text.replace(/^Started /, "").replace(/\.$/, "")}; continuing without it.`;
        } else if (state === "fail") {
          tag = "fail";
          text = `Failed to start ${text.replace(/^Started /, "")}`;
        } else if (state === "skip") {
          tag = "skip";
          text =
            line.wait === "audio"
              ? "Sound is off in Settings; Gunfire Sound Service not started."
              : `Skipped ${text.replace(/^Started /, "")}`;
        }
      }
      put(index, { tag, text, bold: line.bold });
      index += 1;
      setPercent(Math.round((index / BOOT_LOG.length) * LOG_SHARE));
      if (index >= BOOT_LOG.length) later(begin, 260);
      else later(step, line.d * rand(0.7, 1.35));
    };
    later(step, 120);

    // ---- input ----
    const skip = () => finish(true);
    api.current = { skip, answer };
    on(window, "keydown", (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) return;
      if (performance.now() - t0 < KEY_GRACE_MS) return;
      if (current === "prompt") {
        if (e.key === "Enter" || e.key === "y" || e.key === "Y") answer(true);
        else if (e.key === "Escape" || e.key === "n" || e.key === "N") answer(false);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      skip();
    });

    return () => {
      alive = false;
      api.current = { skip() {}, answer() {} };
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      cleanups.forEach((fn) => fn());
      video?.pause();
      audio?.pause();
    };
  }, [navigate, prefs]);

  // Keep the newest log line in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const stop = (e) => e.stopPropagation();

  return (
    <div
      className={`ply ply--${phase}${leaving ? " is-leaving" : ""}`}
      data-reduce-motion={prefs.reduceMotion ? "true" : "false"}
      onClick={() => phase !== "prompt" && api.current.skip()}
    >
      <video
        ref={videoRef}
        className="ply-video"
        src={gunfireVideo}
        preload="auto"
        muted
        playsInline
        disablePictureInPicture
        tabIndex={-1}
        aria-hidden="true"
      />
      {prefs.sound && <audio ref={audioRef} src={gunfireAudio} preload="auto" />}

      <div className="ply-logo" aria-hidden="true">
        <img src={rdrLogo} alt="" draggable={false} />
      </div>

      {!prefs.reduceMotion && <Embers />}

      <div className="ply-log" ref={logRef} aria-hidden="true">
        {lines.map((l) => (
          <div key={l.id} className="ply-line">
            <span className={`ply-tag ply-tag--${l.tag}`}>{TAG_LABEL[l.tag] || ""}</span>
            <span className={l.bold ? "ply-text ply-text--bold" : "ply-text"}>{l.text}</span>
          </div>
        ))}
      </div>

      {phase === "prompt" && (
        <div
          className="ply-prompt"
          role="alertdialog"
          aria-labelledby="ply-prompt-title"
          aria-describedby="ply-prompt-desc"
          onClick={stop}
        >
          <p id="ply-prompt-title" className="ply-prompt-title">
            Enable sound?
          </p>
          <p id="ply-prompt-desc" className="ply-prompt-desc">
            Your browser blocked audio autoplay. Continuing silently in {promptLeft}…
          </p>
          <div className="ply-prompt-actions">
            <button type="button" className="ply-btn ply-btn--yes" autoFocus onClick={() => api.current.answer(true)}>
              <kbd>Enter</kbd> Yes
            </button>
            <button type="button" className="ply-btn" onClick={() => api.current.answer(false)}>
              <kbd>Esc</kbd> No
            </button>
          </div>
        </div>
      )}

      <div
        className="ply-hud"
        role="progressbar"
        aria-label="Booting SherlockOS"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="ply-bar">
          <div className="ply-bar-fill" style={{ transform: `scaleX(${percent / 100})` }} />
        </div>
        <span className="ply-percent">{percent}%</span>
      </div>

      <button
        type="button"
        className="ply-skip"
        onClick={(e) => {
          e.stopPropagation();
          api.current.skip();
        }}
      >
        Skip <span aria-hidden="true">⏎</span>
      </button>

      <div className="ply-fade" aria-hidden="true" />
    </div>
  );
}
