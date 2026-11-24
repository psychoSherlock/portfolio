// Portfolio commands. Every fact comes from src/apps/about/profile.js or the GitHub API.
import { c } from "../shell.js";
import { wrap, table, uptimeText } from "../lib.js";
import profile from "../../about/profile.js";
import snapshot from "../../projects/repos.snapshot.json";
import { APPS } from "../../../os/apps";
import { openPath, openUrl } from "../../../os/open";
import { settings } from "../../../os/settingsStore";
import { wm } from "../../../os/windowStore";
import { BOOT } from "../procs.js";

const h1 = (t) => c.accent(c.bold(t));
const section = (ctx, title) => {
  ctx.print("");
  ctx.print(c.accent("▍"), c.bold(title));
};
const cmdLink = (name) => c.link(c.bold(name), `cmd:${name}`);

// ---------------------------------------------------------------------------
// neofetch
// ---------------------------------------------------------------------------
const LOGO = [
  "           ▄▄▄▄▄▄▄▄           ",
  "       ▄██▀▀▀    ▀▀▀██▄       ",
  "     ▄█▀    ▄▄▄▄▄▄    ▀█▄     ",
  "    ██   ▄█▀▀    ▀▀█▄   ██    ",
  "   ██   ██   ▄▄▄▄   ██   ██   ",
  "   ██  ██   █▀  ▀█   ██  ██   ",
  "   ██  ██   █▄  ▄█   ██  ██   ",
  "   ██   ██   ▀▀▀▀   ██   ██   ",
  "    ██   ▀█▄▄    ▄▄█▀   ██    ",
  "     ▀█▄    ▀▀▀▀▀▀    ▄█▀     ",
  "       ▀██▄▄▄    ▄▄▄██▀█▄     ",
  "           ▀▀▀▀▀▀▀▀   ▀██▄    ",
  "                        ▀██▄  ",
  "                          ▀██ ",
];

let gpuCache;
function gpu() {
  if (gpuCache !== undefined) return gpuCache;
  gpuCache = null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl) {
      const firefox = /firefox/i.test(navigator.userAgent);
      const ext = firefox ? null : gl.getExtension("WEBGL_debug_renderer_info");
      gpuCache = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "")
        .replace(/^ANGLE \((.*)\)$/, "$1")
        .replace(/\s*\(0x[0-9a-f]+\)/gi, "")
        .replace(/, (Direct3D|OpenGL|Vulkan|Metal).*$/i, "")
        .trim() || null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    gpuCache = null;
  }
  return gpuCache;
}

function browser() {
  const ua = navigator.userAgent;
  const pick = [
    [/Edg\/([\d.]+)/, "Microsoft Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ];
  for (const [re, name] of pick) {
    const m = re.exec(ua);
    if (m) {
      const brands = navigator.userAgentData?.brands?.map((b) => b.brand) || [];
      const label = name === "Chrome" && brands.includes("Brave") ? "Brave" : name;
      return `${label} ${m[1].split(".").slice(0, 2).join(".")}`;
    }
  }
  return "Unknown browser";
}
function engine() {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return `Gecko ${(/rv:([\d.]+)/.exec(ua) || [])[1] || ""}`.trim();
  if (/Chrome\//.test(ua)) return `Blink ${(/Chrome\/(\d+)/.exec(ua) || [])[1] || ""}`.trim();
  if (/AppleWebKit\/([\d.]+)/.test(ua)) return `WebKit ${/AppleWebKit\/([\d.]+)/.exec(ua)[1]}`;
  return "unknown";
}
function hostOs() {
  const ua = navigator.userAgent;
  if (/Android ([\d.]+)/.test(ua)) return `Android ${/Android ([\d.]+)/.exec(ua)[1]}`;
  if (/(iPhone|iPad); CPU (?:iPhone )?OS ([\d_]+)/.test(ua)) {
    const m = /(iPhone|iPad); CPU (?:iPhone )?OS ([\d_]+)/.exec(ua);
    return `${m[1] === "iPad" ? "iPadOS" : "iOS"} ${m[2].replace(/_/g, ".")}`;
  }
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X ([\d_.]+)/.test(ua)) return `macOS ${/Mac OS X ([\d_.]+)/.exec(ua)[1].replace(/_/g, ".")}`;
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return navigator.userAgentData?.platform || navigator.platform || "unknown";
}

async function battery() {
  try {
    if (!navigator.getBattery) return null;
    const b = await Promise.race([navigator.getBattery(), new Promise((r) => setTimeout(() => r(null), 300))]);
    if (!b) return null;
    return `${Math.round(b.level * 100)}%${b.charging ? " (charging)" : ""}`;
  } catch {
    return null;
  }
}

async function neofetch(ctx) {
  const user = `${ctx.shell.user}@${ctx.shell.host}`;
  const mem = performance.memory;
  const dm = navigator.deviceMemory;
  const conn = navigator.connection;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const bat = await battery();
  const files = ctx.fs.walk ? ctx.fs.walk(ctx.shell.home).length : null;
  const info = [
    ["OS", `SherlockOS 2026 (web) on ${hostOs()}`],
    ["Host", browser()],
    ["Kernel", engine()],
    ["Uptime", uptimeText(Date.now() - BOOT).replace(/^\s+/, "")],
    ["Packages", `${APPS.length} (apps)${files ? `, ${files} (files)` : ""}`],
    ["Shell", "zsh 5.9"],
    ["Resolution", `${screen.width}x${screen.height} @${Math.round((window.devicePixelRatio || 1) * 100) / 100}x`],
    ["DE", "SherlockOS Desktop"],
    ["WM", "sherlockos-wm"],
    ["Theme", `${settings.theme === "dark" ? "Dark" : "Light"} [accent ${settings.accent}]`],
    ["Terminal", `Terminal (${ctx.term?.cols ?? 80}x${ctx.term?.rows ?? 24})`],
    ["Terminal Font", `${ctx.term?.fontName || "SF Mono"} ${ctx.term?.fontSize ?? 13}px`],
    ["CPU", navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} logical cores` : null],
    ["GPU", gpu()],
    [
      "Memory",
      mem
        ? `${Math.round(mem.usedJSHeapSize / 1048576)}MiB / ${dm ? `${dm * 1024}MiB` : `${Math.round(mem.jsHeapSizeLimit / 1048576)}MiB`}`
        : dm
        ? `${dm} GiB (approx.)`
        : null,
    ],
    ["Locale", `${navigator.language}, ${tz}`],
    ["Network", conn ? `${conn.effectiveType || "?"}${conn.downlink ? `, ~${conn.downlink} Mbps` : ""}${navigator.onLine ? "" : " (offline)"}` : navigator.onLine ? "online" : "offline"],
    ["Battery", bat],
  ].filter(([, v]) => v);

  const right = [
    [c.accent(c.bold(ctx.shell.user)), "@", c.accent(c.bold(ctx.shell.host))],
    ["-".repeat(user.length)],
    ...info.map(([k, v]) => [c.accent(c.bold(k)), ": ", v]),
    [""],
    ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"].map((col) => ({ t: "   ", s: `bg-${col}` })),
    ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"].map((col) => ({ t: "   ", s: `bg-bright-${col}` })),
  ];
  const logoW = LOGO[0].length;
  const side = (ctx.cols ?? 80) >= logoW + 44;
  if (!side) {
    for (const r of right) ctx.print(r);
    return 0;
  }
  const n = Math.max(LOGO.length, right.length);
  for (let i = 0; i < n; i++) {
    const logo = LOGO[i] ?? " ".repeat(logoW);
    ctx.print(c.accent(logo), "  ", right[i] ?? "");
  }
  return 0;
}

// ---------------------------------------------------------------------------
// about / skills / achievements / contact
// ---------------------------------------------------------------------------
function about(ctx) {
  const w = Math.min(ctx.cols ?? 80, 96);
  ctx.print(h1(profile.name), c.gray(`  aka ${profile.alias}`));
  ctx.print(c.bold(profile.title), c.gray(` · ${profile.location}`));
  ctx.print(c.gray(profile.roles.join(" · ")));
  ctx.print("");
  ctx.print(c.italic(c.cyan(`"${profile.tagline}"`)));
  for (const p of profile.bio) {
    ctx.print("");
    for (const l of wrap(p, w)) ctx.print(l);
  }
  section(ctx, "Highlights");
  for (const l of table(profile.stats.map((s) => [c.accent(c.bold(s.value)), s.label]), { align: ["right"] })) ctx.print("  ", l);

  section(ctx, "Experience");
  for (const e of profile.experience) {
    ctx.print("");
    ctx.print("  ", c.bold(e.role), " @ ", c.link(c.accent(e.org), e.url));
    ctx.print("  ", c.gray(`${e.period} · ${e.place}`));
    for (const pt of e.points) {
      const [first, ...more] = wrap(pt, w - 6);
      ctx.print("    ", c.accent("•"), " ", first);
      for (const m of more) ctx.print("      ", m);
    }
  }
  section(ctx, "Education");
  for (const e of profile.education) ctx.print("  ", c.bold(e.degree), c.gray(` · ${e.school} · ${e.period}`));
  section(ctx, "Certifications");
  for (const e of profile.certifications) ctx.print("  ", c.bold(e.title), c.gray(` · ${e.issuer} · ${e.date}`), e.note ? c.gray(` · ${e.note}`) : "");
  section(ctx, "Publications");
  for (const p of profile.publications) ctx.print("  ", c.link(c.bold(p.title), p.url), c.gray(` · ${p.venue} · ${p.date}`));
  ctx.print("");
  ctx.print(c.gray("More: "), cmdLink("skills"), c.gray(" · "), cmdLink("projects"), c.gray(" · "), cmdLink("achievements"), c.gray(" · "), cmdLink("contact"), c.gray(" · "), cmdLink("resume"));
  return 0;
}

function skills(ctx) {
  const w = Math.min(ctx.cols ?? 80, 100);
  ctx.print(h1("Skills"), c.gray(`  ${profile.focus.join(" · ")}`));
  for (const g of profile.skills) {
    section(ctx, g.title);
    // wrap the chips
    let line = [];
    let len = 2;
    for (const it of g.items) {
      if (len + it.length + 3 > w && line.length) {
        ctx.print("  ", line);
        line = [];
        len = 2;
      }
      line.push(c.cyan(it), c.gray(" · "));
      len += it.length + 3;
    }
    if (line.length) ctx.print("  ", line.slice(0, -1));
  }
  section(ctx, "Toolbox");
  for (const l of table(profile.tools.map((t) => [c.bold(t.name), c.gray(t.use)]))) ctx.print("  ", l);
  if (profile.moreTools?.length) ctx.print("  ", c.gray("also: "), profile.moreTools.join(", "));
  return 0;
}

function achievements(ctx) {
  const w = Math.min(ctx.cols ?? 80, 96);
  ctx.print(h1("Achievements"));
  for (const a of profile.achievements) {
    ctx.print("");
    ctx.print("  ", c.yellow("★ "), c.bold(a.title), a.date ? c.gray(`  ${a.date}`) : "");
    ctx.print("    ", c.accent(a.event));
    for (const l of wrap(a.description, w - 4)) ctx.print("    ", c.gray(l));
  }
  section(ctx, "Recognition");
  for (const r of profile.recognition) ctx.print("  ", c.bold(r.title), c.gray(` · ${r.issuer} · ${r.date}`));
  ctx.print("");
  ctx.print(c.gray("Photos: "), c.link(c.bold("open ~/Pictures/Achievements"), "fs:/home/sherlock/Pictures/Achievements"));
  return 0;
}

function contact(ctx) {
  ctx.print(h1("Get in touch"));
  ctx.print("");
  const rows = [
    [c.bold("Email"), c.link(c.accent(profile.email), `mailto:${profile.email}`)],
    ...profile.socials.map((s) => [c.bold(s.label), c.link(s.handle, s.url)]),
  ];
  for (const l of table(rows)) ctx.print("  ", l);
  ctx.print("");
  ctx.print(c.gray("Write a message without leaving SherlockOS: "), c.link(c.bold("open -a Contact"), "app:mail"));
  return 0;
}

function socials(ctx) {
  const id = ctx.args[0]?.toLowerCase();
  if (id) {
    const s = profile.socials.find((x) => x.id === id || x.label.toLowerCase() === id);
    if (!s) return ctx.err(`socials: unknown network '${ctx.args[0]}' (try: ${profile.socials.map((x) => x.id).join(", ")})`), 1;
    openUrl(s.url);
    return 0;
  }
  for (const l of table(profile.socials.map((s) => [c.accent(s.id), c.bold(s.label), c.link(s.url, s.url)]))) ctx.print("  ", l);
  ctx.print("");
  ctx.print(c.gray("Open one with "), c.bold("socials <name>"), c.gray(", e.g. "), c.link(c.bold("socials github"), "cmd:socials github"));
  return 0;
}

// ---------------------------------------------------------------------------
// projects (live GitHub API, snapshot fallback)
// ---------------------------------------------------------------------------
const LANG_COLORS = {
  Python: "#3572A5", JavaScript: "#f1e05a", TypeScript: "#3178c6", HTML: "#e34c26", CSS: "#563d7c",
  Shell: "#89e051", C: "#555555", "C++": "#f34b7d", Go: "#00ADD8", Rust: "#dea584", Java: "#b07219",
  PHP: "#4F5D95", Dart: "#00B4AB", "Jupyter Notebook": "#DA5B0B", Dockerfile: "#384d54", Kotlin: "#A97BFF",
  Ruby: "#701516", Vue: "#41b883", SCSS: "#c6538c", Lua: "#000080", Svelte: "#ff3e00", "C#": "#178600",
};
let repoCache = null;

async function loadRepos(signal) {
  if (repoCache && Date.now() - repoCache.at < 10 * 60e3) return repoCache;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch("https://api.github.com/users/psychoSherlock/repos?per_page=100&sort=pushed", {
      headers: { Accept: "application/vnd.github+json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    repoCache = { repos: data, live: true, at: Date.now() };
  } catch (e) {
    if (signal?.aborted) throw e;
    repoCache = { repos: snapshot, live: false, at: Date.now() };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  return repoCache;
}

const ago = (iso) => {
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1) return "today";
  if (d < 30) return `${Math.floor(d)}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

async function projects(ctx) {
  const all = ctx.args.includes("-a") || ctx.args.includes("--all");
  const byStars = ctx.args.includes("--stars") || ctx.args.includes("-s");
  const nIdx = ctx.args.indexOf("-n");
  const limit = nIdx !== -1 ? Number(ctx.args[nIdx + 1]) || 12 : all ? Infinity : 12;
  const name = ctx.args.find((a, i) => !a.startsWith("-") && ctx.args[i - 1] !== "-n");
  if (ctx.tty) ctx.print(c.gray("Fetching github.com/psychoSherlock …"));
  const { repos, live } = await loadRepos(ctx.signal);
  if (name) {
    const r = repos.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!r) return ctx.err(`projects: no repository named '${name}'`), 1;
    openUrl(r.html_url);
    ctx.print("Opening ", c.bold(r.html_url));
    return 0;
  }
  let list = repos.filter((r) => all || (!r.fork && !r.archived));
  list.sort((a, b) =>
    byStars ? b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at) : new Date(b.pushed_at) - new Date(a.pushed_at)
  );
  const total = list.length;
  list = list.slice(0, limit);
  const w = Math.min(ctx.cols ?? 80, 100);
  ctx.print(h1("Projects"), c.gray(`  ${total} public repositories${live ? "" : " · offline snapshot"}`));
  for (const r of list) {
    ctx.print("");
    const lang = r.language ? [c.hex(LANG_COLORS[r.language] || "#8b8b8b")("● "), r.language] : [c.gray("● "), c.gray("—")];
    ctx.print(
      "  ", c.link(c.accent(c.bold(r.name)), r.html_url),
      r.fork ? c.gray(" (fork)") : "",
      "  ", lang,
      "  ", c.yellow(`★ ${r.stargazers_count}`),
      r.forks_count ? c.gray(`  ⑂ ${r.forks_count}`) : "",
      c.gray(`  ${ago(r.pushed_at)}`)
    );
    if (r.description) for (const l of wrap(r.description.trim(), w - 4)) ctx.print("    ", c.gray(l));
  }
  ctx.print("");
  ctx.print(
    c.gray(total > list.length ? `Showing ${list.length} of ${total}. ` : ""),
    c.gray("Flags: -a (include forks) -s (by stars) -n N · "),
    c.link(c.bold("open -a Projects"), "app:projects")
  );
  return 0;
}

export const portfolioCommands = {
  neofetch: { group: "Portfolio", desc: "system information with the SherlockOS logo", usage: "neofetch", run: neofetch },
  fastfetch: { group: "Portfolio", desc: "neofetch, but faster", usage: "fastfetch", run: neofetch },
  about: { group: "Portfolio", desc: `who is ${profile.shortName}? (bio, experience, education)`, usage: "about", run: about },
  skills: { group: "Portfolio", desc: "skills and security toolbox", usage: "skills", run: skills },
  achievements: { group: "Portfolio", desc: "CTF wins, hackathons and recognition", usage: "achievements", run: achievements },
  projects: {
    group: "Portfolio",
    desc: "public GitHub repositories (live)",
    usage: "projects [-a] [-s] [-n N] [repo]",
    opts: [["-a", "include forks and archived repos"], ["-s", "sort by stars"], ["-n N", "show N repositories"], ["repo", "open that repository"]],
    run: projects,
  },
  contact: { group: "Portfolio", desc: "email and social links", usage: "contact", run: contact },
  socials: { group: "Portfolio", desc: "social profiles (socials <name> opens one)", usage: "socials [name]", run: socials },
  resume: {
    group: "Portfolio",
    desc: "open the résumé in Preview",
    usage: "resume",
    run(ctx) {
      if (!ctx.fs.exists(profile.resume)) return ctx.err(`resume: ${profile.resume}: No such file or directory`), 1;
      openPath(profile.resume);
      ctx.print("Opening ", c.bold(ctx.shell.tilde(profile.resume)), " in Preview…");
      return 0;
    },
  },
  cv: null,
  mail: {
    group: "Portfolio",
    desc: "compose a message to Athul (opens Contact)",
    usage: "mail",
    run() {
      wm.open("mail");
      return 0;
    },
  },
};
portfolioCommands.cv = { ...portfolioCommands.resume, desc: "alias of resume" };
