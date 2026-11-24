// Full-screen terminal programs (the "alternate screen"): matrix, htop, sl.
// Each receives { props, onExit, keys } - keys.current = (event) => handled? lets the
// terminal forward keystrokes from its hidden textarea.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useWindows, wm } from "../../os/windowStore";
import { useSettings } from "../../os/settingsStore";
import { SYSTEM_PROCS, windowProcs, usage, killPid, BOOT } from "./procs.js";
import { uptimeText } from "./lib.js";

// ---------------------------------------------------------------------------
// matrix
// ---------------------------------------------------------------------------
const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF<>/\\|=+*";

function Matrix({ props, onExit, keys }) {
  const canvasRef = useRef(null);
  const reduce = useSettings((s) => s.reduceMotion);
  useEffect(() => {
    keys.current = (e) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return true;
      onExit();
      return true;
    };
    return () => (keys.current = null);
  }, [keys, onExit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const size = 15;
    let w = 0;
    let h = 0;
    let drops = [];
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const cols = Math.ceil(w / size);
      drops = Array.from({ length: cols }, (_, i) => drops[i] ?? -Math.random() * (h / size));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    let raf = 0;
    let last = 0;
    const frameMs = reduce ? 110 : 50;
    const step = (t) => {
      raf = requestAnimationFrame(step);
      if (t - last < frameMs) return;
      last = t;
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${size}px var(--font-mono), monospace`;
      ctx.textBaseline = "top";
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * size;
        const ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        ctx.fillStyle = "#d8ffe0";
        ctx.fillText(ch, i * size, y);
        ctx.fillStyle = "#1fe36a";
        ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], i * size, y - size);
        if (y > h && Math.random() > 0.975) drops[i] = 0;
        else drops[i] += 1;
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduce]);

  return (
    <div className="terminal-screen terminal-matrix" onPointerDown={onExit}>
      <canvas ref={canvasRef} className="terminal-matrix-canvas" aria-hidden="true" />
      {props.message && <div className="terminal-matrix-msg">{props.message}</div>}
      <div className="terminal-matrix-hint">press any key to exit</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// htop
// ---------------------------------------------------------------------------
const Bar = memo(function Bar({ label, value, text, width = 28 }) {
  const n = Math.max(0, Math.min(width, Math.round((value / 100) * width)));
  const low = Math.min(n, Math.round(width * 0.5));
  const mid = Math.min(n - low, Math.round(width * 0.3));
  const high = n - low - mid;
  return (
    <div className="terminal-htop-bar">
      <span className="t-cyan">{label.padStart(3)}</span>
      <span className="t-bold">[</span>
      <span className="t-green">{"|".repeat(low)}</span>
      <span className="t-yellow">{"|".repeat(mid)}</span>
      <span className="t-red">{"|".repeat(high)}</span>
      <span>{" ".repeat(Math.max(0, width - n))}</span>
      <span className="t-gray">{text.padStart(7)}</span>
      <span className="t-bold">]</span>
    </div>
  );
});

function Htop({ onExit, keys }) {
  const windows = useWindows((s) => s.windows);
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1500);
    return () => clearInterval(t);
  }, []);

  const procs = useMemo(() => {
    const list = [...SYSTEM_PROCS, ...windowProcs(windows)].map((p) => ({ ...p, ...usage(p, tick) }));
    return list.sort((a, b) => b.cpu - a.cpu);
  }, [windows, tick]);
  const cur = Math.min(sel, procs.length - 1);

  useEffect(() => {
    keys.current = (e) => {
      const k = e.key;
      if (k === "q" || k === "Q" || k === "F10" || k === "Escape") onExit();
      else if (k === "ArrowDown" || k === "j") setSel((s) => Math.min(procs.length - 1, s + 1));
      else if (k === "ArrowUp") setSel((s) => Math.max(0, s - 1));
      else if (k === "Home" || k === "g") setSel(0);
      else if (k === "End" || k === "G") setSel(procs.length - 1);
      else if (k === "k" || k === "F9") {
        const p = procs[cur];
        if (p) setMsg(killPid(p.pid) ? `kill ${p.pid}: operation not permitted` : `Sent SIGTERM to ${p.pid} (${p.name})`);
      } else if (k === "Enter") {
        const p = procs[cur];
        if (p?.windowId) wm.focus(p.windowId);
      } else return false;
      return true;
    };
    return () => (keys.current = null);
  }, [keys, onExit, procs, cur]);

  const cores = Math.min(8, navigator.hardwareConcurrency || 4);
  const total = procs.reduce((a, p) => a + p.cpu, 0);
  const heap = performance.memory;
  const memTotal = (navigator.deviceMemory || 8) * 1024;
  const memUsed = heap ? Math.round(heap.usedJSHeapSize / 1048576) + 900 : Math.round(memTotal * 0.34);
  const coreLoad = (i) => Math.min(100, (total / cores) * (0.6 + ((i * 37 + tick * 13) % 9) / 10) + 1);
  const loads = [0.42, 0.37, 0.31].map((v, i) => (v + ((tick + i) % 5) / 20).toFixed(2));
  const running = procs.filter((p) => p.windowId && !p.minimized).length;

  return (
    <div className="terminal-screen terminal-htop" role="application" aria-label="htop">
      <div className="terminal-htop-head">
        <div className="terminal-htop-col">
          {Array.from({ length: Math.ceil(cores / 2) }, (_, i) => (
            <Bar key={i} label={String(i)} value={coreLoad(i)} text={`${coreLoad(i).toFixed(1)}%`} />
          ))}
          <Bar label="Mem" value={(memUsed / memTotal) * 100} text={`${(memUsed / 1024).toFixed(2)}G/${(memTotal / 1024).toFixed(1)}G`} />
          <Bar label="Swp" value={0} text={`0K/2.0G`} />
        </div>
        <div className="terminal-htop-col">
          {Array.from({ length: Math.floor(cores / 2) }, (_, i) => {
            const j = i + Math.ceil(cores / 2);
            return <Bar key={j} label={String(j)} value={coreLoad(j)} text={`${coreLoad(j).toFixed(1)}%`} />;
          })}
          <div>
            <span className="t-cyan">  Tasks: </span>
            <span className="t-bold">{procs.length}</span>
            <span className="t-cyan">, </span>
            <span className="t-green t-bold">{running}</span>
            <span className="t-cyan"> running</span>
          </div>
          <div>
            <span className="t-cyan">  Load average: </span>
            <span className="t-bold">{loads.join(" ")}</span>
          </div>
          <div>
            <span className="t-cyan">  Uptime: </span>
            <span className="t-bold">{uptimeText(Date.now() - BOOT)}</span>
          </div>
        </div>
      </div>
      <div className="terminal-htop-table os-scroll">
        <div className="terminal-htop-row terminal-htop-th">
          <span className="r w6">PID</span>
          <span className="w9">USER</span>
          <span className="r w4">PRI</span>
          <span className="r w4">NI</span>
          <span className="r w7">VIRT</span>
          <span className="r w7">RES</span>
          <span className="w2">S</span>
          <span className="r w6">CPU%</span>
          <span className="r w6">MEM%</span>
          <span className="cmd">Command</span>
        </div>
        {procs.map((p, i) => (
          <div
            key={p.pid}
            className={`terminal-htop-row${i === cur ? " is-sel" : ""}`}
            onPointerDown={() => setSel(i)}
            onDoubleClick={() => p.windowId && wm.focus(p.windowId)}
          >
            <span className="r w6">{p.pid}</span>
            <span className="w9">{p.user}</span>
            <span className="r w4">20</span>
            <span className="r w4">0</span>
            <span className="r w7">{`${(p.virt / 1024).toFixed(0)}M`}</span>
            <span className="r w7">{`${(p.rss / 1024).toFixed(0)}M`}</span>
            <span className="w2">{p.windowId ? (p.minimized ? "T" : "R") : "S"}</span>
            <span className="r w6">{p.cpu.toFixed(1)}</span>
            <span className="r w6">{p.mem.toFixed(1)}</span>
            <span className={`cmd${p.windowId ? " t-bold" : " t-gray"}`}>{p.cmd}</span>
          </div>
        ))}
      </div>
      <div className="terminal-htop-foot">
        {msg ? <span className="terminal-htop-msg">{msg}</span> : null}
        {[
          ["F1", "Help"], ["F3", "Search"], ["F6", "SortBy"], ["k", "Kill"], ["↵", "Focus"], ["q", "Quit"],
        ].map(([k, l]) => (
          <span key={k} className="terminal-htop-fkey">
            <b>{k}</b>
            <i>{l}</i>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// sl
// ---------------------------------------------------------------------------
const SMOKE = [
  String.raw`                      (  ) (@@) ( )  (@)  ()    @@    O     @     O     @`,
  String.raw`                 (@@@)`,
  String.raw`             (    )`,
  String.raw`          (@@@@)`,
  String.raw`        (   )`,
];
const BODY = [
  String.raw`      ====        ________                ___________ `,
  String.raw`  _D _|  |_______/        \__I_I_____===__|_________| `,
  String.raw`   |(_)---  |   H\________/ |   |        =|___ ___|      _________________         `,
  String.raw`   /     |  |   H  |  |     |   |         ||_| |_||     _|                \_____A  `,
  String.raw`  |      |  |   H  |__--------------------| [___] |   =|                        |  `,
  String.raw`  | ________|___H__/__|_____/[][]~\_______|       |   -|                        |  `,
  String.raw`  |/ |   |-----------I_____I [][] []  D   |=======|____|________________________|_ `,
];
const WHEELS = [
  [
    String.raw`__/ =| o |=-~~\  /~~\  /~~\  /~~\ ____Y___________|__|__________________________|_ `,
    String.raw` |/-=|___|=    ||    ||    ||    |_____/~\___/          |_D__D__D_|  |_D__D__D_|   `,
    String.raw`  \_/      \O=====O=====O=====O_/      \_/               \_/   \_/    \_/   \_/    `,
  ],
  [
    String.raw`__/ =| o |=-~~\  /~~\  /~~\  /~~\ ____Y___________|__|__________________________|_ `,
    String.raw` |/-=|___|=O=====O=====O=====O   |_____/~\___/          |_D__D__D_|  |_D__D__D_|   `,
    String.raw`  \_/      \__/  \__/  \__/  \__/      \_/               \_/   \_/    \_/   \_/    `,
  ],
];

function Sl({ onExit, keys }) {
  const [frame, setFrame] = useState(0);
  const reduce = useSettings((s) => s.reduceMotion);
  useEffect(() => {
    keys.current = () => true; // sl famously ignores you
    return () => (keys.current = null);
  }, [keys]);
  useEffect(() => {
    if (reduce) {
      const t = setTimeout(onExit, 2500); // reduced motion: a parked train
      return () => clearTimeout(t);
    }
    const t = setInterval(() => setFrame((f) => f + 1), 140);
    return () => clearInterval(t);
  }, [reduce, onExit]);
  const smoke = frame % 2 ? SMOKE : SMOKE.map((l) => " " + l);
  const train = [...smoke, ...BODY, ...WHEELS[frame % 2]].join("\n");
  return (
    <div className="terminal-screen terminal-sl">
      <pre className={`terminal-sl-train${reduce ? " is-parked" : ""}`} onAnimationEnd={reduce ? undefined : onExit}>
        {train}
      </pre>
    </div>
  );
}

const SCREENS = { matrix: Matrix, htop: Htop, sl: Sl };

export default function Screen({ kind, props, onExit, keys }) {
  const Comp = SCREENS[kind];
  if (!Comp) return null;
  return <Comp props={props || {}} onExit={onExit} keys={keys} />;
}
