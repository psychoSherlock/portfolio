// Network toys, full-screen toys and harmless jokes.
import { c, flat } from "../shell.js";
import { getopts, wrap, strftime, table } from "../lib.js";

// ---------------------------------------------------------------------------
// network helpers
// ---------------------------------------------------------------------------
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "sherlockos", "0.0.0.0"]);
const isLocal = (h) => LOCAL.has(h.toLowerCase());

async function resolveA(host, signal) {
  if (isLocal(host)) return "127.0.0.1";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, {
    headers: { Accept: "application/dns-json" },
    signal,
  });
  const data = await res.json();
  if (data.Status === 3) return null; // NXDOMAIN
  const a = (data.Answer || []).find((x) => x.type === 1);
  return a ? a.data : host;
}

const hostOf = (s) => {
  try {
    return new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`).hostname;
  } catch {
    return s;
  }
};

// ---------------------------------------------------------------------------
// ascii toys
// ---------------------------------------------------------------------------
const COWS = {
  default: [
    "        \\   ^__^",
    "         \\  (oo)\\_______",
    "            (__)\\       )\\/\\",
    "                ||----w |",
    "                ||     ||",
  ],
  tux: [
    "   \\",
    "    \\",
    "        .--.",
    "       |o_o |",
    "       |:_/ |",
    "      //   \\ \\",
    "     (|     | )",
    "    /'\\_   _/`\\",
    "    \\___)=(___/",
  ],
};

function bubble(text, width = 40) {
  const ls = wrap(text.replace(/\t/g, "  ").trim() || "", width);
  const w = Math.max(...ls.map((l) => l.length));
  const out = [` ${"_".repeat(w + 2)}`];
  if (ls.length === 1) out.push(`< ${ls[0].padEnd(w)} >`);
  else
    ls.forEach((l, i) => {
      const [a, b] = i === 0 ? ["/", "\\"] : i === ls.length - 1 ? ["\\", "/"] : ["|", "|"];
      out.push(`${a} ${l.padEnd(w)} ${b}`);
    });
  out.push(` ${"-".repeat(w + 2)}`);
  return out;
}

const FORTUNES = [
  ["When you have eliminated the impossible, whatever remains, however improbable, must be the truth.", "Sherlock Holmes, The Sign of the Four"],
  ["You see, but you do not observe. The distinction is clear.", "Sherlock Holmes, A Scandal in Bohemia"],
  ["Data! Data! Data! I can't make bricks without clay.", "Sherlock Holmes, The Adventure of the Copper Beeches"],
  ["There is nothing more deceptive than an obvious fact.", "Sherlock Holmes, The Boscombe Valley Mystery"],
  ["It is a capital mistake to theorize before one has data.", "Sherlock Holmes, A Scandal in Bohemia"],
  ["The quieter you become, the more you are able to hear.", "Kali Linux motto"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["When in doubt, use brute force.", "Ken Thompson"],
  ["Amateurs hack systems, professionals hack people.", "Bruce Schneier"],
  ["Security is a process, not a product.", "Bruce Schneier"],
  ["Debugging is twice as hard as writing the code in the first place.", "Brian Kernighan"],
  ["UNIX is basically a simple operating system, but you have to be a genius to understand the simplicity.", "Dennis Ritchie"],
  ["The only truly secure system is one that is powered off, cast in a block of concrete and sealed in a lead-lined room with armed guards.", "Gene Spafford"],
  ["Given enough eyeballs, all bugs are shallow.", "Eric S. Raymond"],
  ["Premature optimization is the root of all evil.", "Donald Knuth"],
  ["Hackers are breaking the systems for profit. Before, it was about intellectual curiosity and pursuit of knowledge and thrill.", "Kevin Mitnick"],
];

// ---------------------------------------------------------------------------
// nmap (simulated)
// ---------------------------------------------------------------------------
const PORTS = [
  [21, "ftp", "finder", "Finder file service"],
  [22, "ssh", "terminal", "Terminal (zsh 5.9)"],
  [25, "smtp", "mail", "Contact mail relay"],
  [80, "http", "safari", "Safari web engine"],
  [443, "https", "projects", "Projects (GitHub API)"],
  [631, "ipp", "preview", "Preview document server"],
  [1337, "waste", "about", "About Me (psychoSherlock)"],
  [3689, "daap", "music", "Music sharing"],
  [5000, "upnp", "photos", "Photos library"],
  [5900, "vnc", "settings", "System Settings remote panel"],
  [8000, "http-alt", "notes", "Notes"],
  [8443, "https-alt", "textedit", "TextEdit document service"],
];

async function nmap(ctx) {
  const targets = ctx.args.filter((a, i) => !a.startsWith("-") && !/^-p$/.test(ctx.args[i - 1] || ""));
  if (!targets.length) {
    ctx.print("Nmap 7.94SVN ( https://nmap.org )");
    ctx.print("Usage: nmap [Scan Type(s)] [Options] {target specification}");
    ctx.print(c.gray("This nmap is simulated: it only scans SherlockOS itself. Try "), c.link(c.bold("nmap -sV localhost"), "cmd:nmap -sV localhost"));
    return 0;
  }
  const t = hostOf(targets[0]);
  const self = isLocal(t) || t === location.hostname || /psychosherlock\.github\.io$/i.test(t);
  if (!self) {
    ctx.err(`nmap: refusing to scan '${t}': this is a simulated scanner that only maps SherlockOS.`);
    ctx.err(c.gray("Scanning hosts you don't own is a great way to meet their lawyers. Try "), c.bold("nmap localhost"));
    return 1;
  }
  const t0 = performance.now();
  const version = ctx.args.includes("-sV") || ctx.args.includes("-A");
  ctx.print(`Starting Nmap 7.94SVN ( https://nmap.org ) at ${strftime("%F %R %Z")}  `, c.yellow("[simulated]"));
  await ctx.sleep(500);
  ctx.print(`Nmap scan report for ${isLocal(t) ? "sherlockos" : t} (127.0.0.1)`);
  ctx.print(`Host is up (0.000${(Math.random() * 90 + 10) | 0}s latency).`);
  await ctx.sleep(400);
  ctx.print(c.gray("Stats: 0:00:01 elapsed; 0 hosts completed (1 up), 1 undergoing SYN Stealth Scan"));
  await ctx.sleep(600);
  ctx.print(`Not shown: ${1000 - PORTS.length} closed tcp ports (reset)`);
  const rows = [["PORT", "STATE", "SERVICE", version ? "VERSION" : ""].map((h) => c.bold(h))];
  for (const [port, svc, app, desc] of PORTS) {
    rows.push([`${port}/tcp`, c.green("open"), c.link(svc, `app:${app}`), version ? c.link(c.gray(desc), `app:${app}`) : ""]);
  }
  for (const l of table(rows)) {
    ctx.print(l);
    await ctx.sleep(60);
  }
  if (ctx.args.includes("-A") || ctx.args.includes("-O")) {
    ctx.print("Device type: general purpose|web browser");
    ctx.print("OS details: SherlockOS 2026 (Linux 6.12 personality), running in your browser");
  }
  ctx.print("");
  ctx.print(c.gray("# Simulated scan of this portfolio: every open port is an app. Click a service to open it."));
  ctx.print(`Nmap done: 1 IP address (1 host up) scanned in ${((performance.now() - t0) / 1000).toFixed(2)} seconds`);
  return 0;
}

// ---------------------------------------------------------------------------
// ping (ICMP isn't available to web pages: we time HTTPS round-trips instead)
// ---------------------------------------------------------------------------
async function ping(ctx) {
  const { o, rest } = getopts("ping", ctx.args, { flags: "qn46", values: "ciWs" });
  if (!rest.length) {
    ctx.err("ping: usage error: Destination address required");
    return 1;
  }
  const host = hostOf(rest[0]);
  const count = o.c != null ? Number(o.c) : Infinity;
  const interval = Math.max(200, (o.i != null ? Number(o.i) : 1) * 1000);
  let ip;
  try {
    ip = await resolveA(host, ctx.signal);
  } catch (e) {
    if (e?.name === "AbortError") return 130;
    ip = host;
  }
  if (!ip) {
    ctx.err(`ping: ${host}: Name or service not known`);
    return 2;
  }
  const local = isLocal(host);
  ctx.print(`PING ${host} (${ip}) 56(84) bytes of data.`, c.gray(local ? "" : "   [simulated ICMP: timing HTTPS round-trips]"));
  const times = [];
  let sent = 0;
  const start = performance.now();
  const stats = () => {
    const recv = times.length;
    ctx.print("");
    ctx.print(`--- ${host} ping statistics ---`);
    ctx.print(`${sent} packets transmitted, ${recv} received, ${sent ? Math.round(((sent - recv) / sent) * 100) : 0}% packet loss, time ${Math.round(performance.now() - start)}ms`);
    if (recv) {
      const min = Math.min(...times);
      const max = Math.max(...times);
      const avg = times.reduce((a, b) => a + b, 0) / recv;
      const mdev = Math.sqrt(times.reduce((a, b) => a + (b - avg) ** 2, 0) / recv);
      ctx.print(`rtt min/avg/max/mdev = ${[min, avg, max, mdev].map((x) => x.toFixed(3)).join("/")} ms`);
    }
    return recv ? 0 : 1;
  };
  try {
    while (sent < count) {
      sent++;
      const seq = sent;
      let ms = null;
      if (local) {
        ms = 0.02 + Math.random() * 0.06;
      } else {
        const t0 = performance.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const onAbort = () => ctrl.abort();
        ctx.signal?.addEventListener("abort", onAbort, { once: true });
        try {
          await fetch(`https://${host}/favicon.ico?ping=${Date.now()}`, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
          ms = performance.now() - t0;
        } catch {
          ctx.checkAbort();
        } finally {
          clearTimeout(timer);
          ctx.signal?.removeEventListener("abort", onAbort);
        }
      }
      if (ms != null) {
        times.push(ms);
        if (!o.q) ctx.print(`64 bytes from ${local ? "localhost" : host} (${ip}): icmp_seq=${seq} ttl=${local ? 64 : 57} time=${ms < 1 ? ms.toFixed(3) : ms.toFixed(1)} ms`);
      } else if (!o.q) ctx.print(`From ${ip} icmp_seq=${seq} Destination Host Unreachable`);
      if (sent < count) await ctx.sleep(Math.max(0, interval - (ms || 0)));
    }
  } catch (e) {
    if (e?.name !== "AbortError") throw e;
    stats();
    return 130;
  }
  return stats();
}

// ---------------------------------------------------------------------------
// curl (real fetch; explains CORS)
// ---------------------------------------------------------------------------
const BINARY_CT = /^(image|audio|video|font)\/|application\/(pdf|zip|octet-stream|x-|gzip|wasm)/i;

async function curl(ctx) {
  const { o, rest } = getopts("curl", ctx.args, {
    flags: "sSILikfvOg",
    values: "oXHdAu",
    long: {
      silent: "s", "show-error": "S", head: "I", location: "L", include: "i", insecure: "k", fail: "f",
      verbose: "v", "remote-name": "O", output: "o", request: "X", header: "H", data: "d", "user-agent": "A",
    },
  });
  if (!rest.length) {
    ctx.err("curl: try 'curl --help' or 'curl --manual' for more information");
    return 2;
  }
  const raw = rest[0];
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    ctx.err(`curl: (3) URL rejected: Malformed input to a URL function`);
    return 3;
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    ctx.err(`curl: (1) Protocol "${parsed.protocol.replace(":", "")}" not supported`);
    return 1;
  }
  const method = o.X || (o.I ? "HEAD" : o.d != null ? "POST" : "GET");
  const headers = {};
  if (o.H) {
    const i = o.H.indexOf(":");
    if (i > 0) headers[o.H.slice(0, i).trim()] = o.H.slice(i + 1).trim();
  }
  if (o.v) {
    ctx.print(c.gray(`*   Trying ${parsed.host}...`));
    ctx.print(c.gray(`> ${method} ${parsed.pathname}${parsed.search} HTTP/2`));
    ctx.print(c.gray(`> Host: ${parsed.host}`));
    ctx.print(c.gray("> User-Agent: curl/8.10.1 (via the browser's fetch)"));
    ctx.print(c.gray(">"));
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: o.d ?? undefined, signal: ctx.signal, redirect: "follow" });
  } catch (e) {
    if (e?.name === "AbortError") return 130;
    if (!o.s || o.S) {
      ctx.err(`curl: (7) Failed to connect to ${parsed.host}: the browser blocked the response`);
      ctx.err(
        c.gray(
          "Web pages can only read responses from servers that send CORS headers, and this one doesn't (or it's unreachable). "
        )
      );
      ctx.err(c.gray("Try an API that allows it: "), c.link(c.bold("curl https://api.github.com/users/psychoSherlock"), "cmd:curl https://api.github.com/users/psychoSherlock"));
      ctx.err(c.gray("or view it in Safari: "), c.link(c.bold(`open ${url}`), url));
    }
    return 7;
  }
  if (o.f && res.status >= 400) {
    if (!o.s || o.S) ctx.err(`curl: (22) The requested URL returned error: ${res.status}`);
    return 22;
  }
  if (o.i || o.I || o.v) {
    ctx.print(`HTTP/2 ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`);
    res.headers.forEach((v, k) => ctx.print(c.cyan(k), ": ", v));
    ctx.print("");
  }
  if (o.I || method === "HEAD") return 0;
  const ct = res.headers.get("content-type") || "";
  const outName = o.o || (o.O ? decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "index.html") : null);
  if (BINARY_CT.test(ct)) {
    if (outName) {
      ctx.err(`curl: (23) binary downloads (${ct.split(";")[0]}) can't be stored in the text-only virtual filesystem`);
      return 23;
    }
    ctx.err('Warning: Binary output can mess up your terminal. Use "--output -" to tell');
    ctx.err("Warning: curl to output it to your terminal anyway, or consider \"--output");
    ctx.err('Warning: <FILE>" to save to a file.');
    return 23;
  }
  let text = await res.text();
  if (outName && outName !== "-") {
    const p = ctx.resolve(outName);
    if (!ctx.fs.isDir(p.slice(0, p.lastIndexOf("/")) || "/")) {
      ctx.err(`curl: (23) Failure writing output to destination, passed ${outName.length} returned 0`);
      return 23;
    }
    ctx.fs.writeText(p, text);
    if (!o.s) ctx.err(c.gray(`  % Total    % Received   Time   ${text.length} bytes -> ${ctx.shell.tilde(p)}`));
    return 0;
  }
  const LIMIT = 200000;
  if (text.length > LIMIT) {
    text = text.slice(0, LIMIT);
    ctx.out(text, "\n");
    ctx.err(c.gray(`[output truncated at ${LIMIT} characters; use -o file to save it all]`));
    return 0;
  }
  ctx.out(text);
  if (text && !text.endsWith("\n") && ctx.tty) ctx.out(c.inverse("%"), "\n");
  return 0;
}

// ---------------------------------------------------------------------------
// sudo / su
// ---------------------------------------------------------------------------
async function sudo(ctx) {
  if (!ctx.args.length || ctx.args[0] === "-h") {
    ctx.err("usage: sudo -h | -K | -k | -V");
    ctx.err("usage: sudo [-u user] command [arg ...]");
    return 1;
  }
  if (ctx.args[0] === "-k" || ctx.args[0] === "-K") return 0;
  if (!ctx.term?.readLine) return ctx.err("sudo: a terminal is required to read the password"), 1;
  await ctx.term.readLine({ prompt: `[sudo] password for ${ctx.shell.user}: `, hidden: true, signal: ctx.signal });
  await ctx.sleep(700);
  ctx.print(`${ctx.shell.user} is not in the sudoers file.`);
  ctx.print("This incident will be reported.");
  ctx.print(c.gray("(It was reported to Sherlock. He deduced it was you.)"));
  return 1;
}

async function su(ctx) {
  if (!ctx.term?.readLine) return ctx.err("su: must be run from a terminal"), 1;
  await ctx.term.readLine({ prompt: "Password: ", hidden: true, signal: ctx.signal });
  await ctx.sleep(1200);
  ctx.err("su: Authentication failure");
  return 1;
}

// ---------------------------------------------------------------------------
// help / man
// ---------------------------------------------------------------------------
const GROUP_ORDER = ["Portfolio", "Files", "Text", "Desktop", "System", "Network", "Fun", "Shell"];
const GROUP_BLURB = {
  Portfolio: "who is behind this machine",
  Files: "the virtual filesystem",
  Text: "filters and text tools (pipe them!)",
  Desktop: "drive SherlockOS from here",
  System: "processes and system info",
  Network: "talk to the real internet",
  Fun: "you have earned it",
  Shell: "builtins and environment",
};

function help(ctx) {
  if (ctx.args[0]) return man(ctx);
  const { commands, aliases } = ctx.shell;
  const groups = {};
  for (const [name, def] of Object.entries(commands)) {
    if (!def || def.hidden) continue;
    (groups[def.group || "Shell"] ??= []).push(name);
  }
  ctx.print(c.accent(c.bold("SherlockOS zsh")), c.gray(" · type "), c.bold("man <command>"), c.gray(" for details"));
  for (const g of GROUP_ORDER) {
    if (!groups[g]) continue;
    ctx.print("");
    ctx.print(c.accent("▍"), c.bold(g), c.gray(`  ${GROUP_BLURB[g] || ""}`));
    const names = groups[g].sort();
    const cells = names.map((n) => ({ text: n, seg: c.link(c.green(n), `cmd:${n}`) }));
    const width = Math.max(...names.map((n) => n.length)) + 2;
    const per = Math.max(1, Math.floor(((ctx.cols ?? 80) - 2) / width));
    for (let i = 0; i < cells.length; i += per) {
      const row = cells.slice(i, i + per);
      ctx.print("  ", row.map((x, j) => [x.seg, j < row.length - 1 ? " ".repeat(width - x.text.length) : ""]));
    }
  }
  ctx.print("");
  ctx.print(c.gray("Aliases: "), Object.keys(aliases).sort().join(" "));
  ctx.print(
    c.gray("Keys: "),
    "Tab", c.gray(" complete · "), "↑/↓", c.gray(" history · "), "Ctrl+C", c.gray(" interrupt · "),
    "Ctrl+L", c.gray(" clear · "), "Ctrl+=/-", c.gray(" font size")
  );
  ctx.print(c.gray("Supports pipes |, && ||, ;, > >> <, $VAR, $(cmd), globs, !! and aliases."));
  return 0;
}

function man(ctx) {
  const name = ctx.args.find((a) => !a.startsWith("-"));
  if (!name) {
    ctx.err("What manual page do you want?\nFor example, try 'man man'.");
    return 1;
  }
  const { commands, aliases } = ctx.shell;
  if (!Object.hasOwn(commands, name) || !commands[name]) {
    if (Object.hasOwn(aliases, name)) {
      ctx.print(`${name} is an alias for ${c.bold(aliases[name])}`);
      return 0;
    }
    ctx.err(`No manual entry for ${name}`);
    return 16;
  }
  const def = commands[name];
  const up = `${name.toUpperCase()}(1)`;
  const w = Math.min(ctx.cols ?? 80, 90);
  ctx.print(c.bold(up), " ".repeat(Math.max(1, w - up.length * 2 - 18)), "SherlockOS Manual", " ".repeat(1), c.bold(up));
  ctx.print("");
  ctx.print(c.bold("NAME"));
  ctx.print(`       ${name} - ${def.desc || ""}`);
  ctx.print("");
  ctx.print(c.bold("SYNOPSIS"));
  ctx.print("       ", c.bold(def.usage || name));
  if (def.opts?.length) {
    ctx.print("");
    ctx.print(c.bold("OPTIONS"));
    for (const [flag, text] of def.opts) {
      ctx.print("       ", c.bold(flag));
      for (const l of wrap(text, w - 14)) ctx.print("              ", l);
    }
  }
  if (def.builtin) {
    ctx.print("");
    ctx.print(c.bold("NOTES"));
    ctx.print("       This is a shell built-in command.");
  }
  ctx.print("");
  ctx.print(c.gray(`SherlockOS 2026                     ${strftime("%B %Y")}                     ${up}`));
  return 0;
}

// ---------------------------------------------------------------------------
export const funCommands = {
  sudo: { group: "Fun", desc: "execute a command as another user (good luck)", usage: "sudo command", run: sudo },
  su: { group: "Fun", desc: "run a shell as root (also good luck)", usage: "su [user]", run: su },
  nmap: {
    group: "Network",
    desc: "network mapper (simulated scan of this portfolio)",
    usage: "nmap [-sV] [-A] localhost",
    opts: [["-sV", "show what each service (app) is"], ["-A", "aggressive: add OS detection"]],
    run: nmap,
  },
  ping: {
    group: "Network",
    desc: "measure round-trip time to a host (Ctrl+C stops)",
    usage: "ping [-c count] [-i interval] host",
    opts: [["-c count", "stop after count replies"], ["-i seconds", "wait between pings"], ["-q", "quiet: summary only"]],
    run: ping,
  },
  curl: {
    group: "Network",
    desc: "transfer a URL (real fetch, CORS permitting)",
    usage: "curl [-sILfv] [-o file] [-X method] [-H header] [-d data] url",
    opts: [
      ["-I", "fetch the headers only"],
      ["-i", "include response headers in the output"],
      ["-o file", "write output to file in the virtual filesystem"],
      ["-O", "write output to a file named like the remote file"],
      ["-f", "fail silently on HTTP errors"],
      ["-s", "silent mode"],
      ["-X method", "request method to use"],
      ["-H header", "pass a custom header"],
      ["-d data", "HTTP POST data"],
    ],
    run: curl,
  },
  matrix: {
    group: "Fun",
    desc: "follow the white rabbit (any key exits)",
    usage: "matrix",
    async run(ctx) {
      if (!ctx.term?.takeover) return ctx.err("matrix: needs a terminal"), 1;
      await ctx.term.takeover("matrix", {}, ctx.signal);
      return 0;
    },
  },
  hack: {
    group: "Fun",
    desc: "hack the planet (Hollywood edition)",
    usage: "hack",
    async run(ctx) {
      const steps = [
        "Bypassing the mainframe firewall",
        "Reversing the polarity of the neutron flow",
        "Downloading more RAM",
        "Hacking the Gibson",
        "Enhancing... enhancing... ENHANCE",
      ];
      for (const s of steps) {
        ctx.out(c.green("[+] "), s);
        const dots = Math.max(3, 46 - s.length);
        for (let i = 0; i < dots; i += 3) {
          ctx.out(c.gray("..."));
          await ctx.sleep(35);
        }
        ctx.print(" ", c.green(c.bold("done")));
      }
      ctx.print("");
      ctx.print(c.green(c.bold("ACCESS GRANTED")), c.gray("  (nothing was actually hacked)"));
      await ctx.sleep(700);
      if (ctx.term?.takeover) await ctx.term.takeover("matrix", { message: "ACCESS GRANTED" }, ctx.signal);
      return 0;
    },
  },
  sl: {
    group: "Fun",
    desc: "steam locomotive (for when you mistype ls)",
    usage: "sl",
    async run(ctx) {
      if (!ctx.term?.takeover) return 0;
      await ctx.term.takeover("sl", {}, ctx.signal);
      return 0;
    },
  },
  htop: {
    group: "System",
    desc: "interactive process viewer (windows are processes; q quits)",
    usage: "htop",
    async run(ctx) {
      if (!ctx.term?.takeover) return ctx.err("htop: needs a terminal"), 1;
      await ctx.term.takeover("htop", {}, ctx.signal);
      return 0;
    },
  },
  cowsay: {
    group: "Fun",
    desc: "a talking cow",
    usage: "cowsay [-f tux] message",
    run(ctx) {
      const { o, rest } = getopts("cowsay", ctx.args, { flags: "l", values: "fW" });
      if (o.l) return ctx.print("Cow files in /usr/share/cowsay/cows:\ndefault tux"), 0;
      const cow = COWS[o.f || "default"];
      if (!cow) return ctx.err(`cowsay: Could not find ${o.f} cowfile!`), 1;
      const text = rest.length ? rest.join(" ") : (ctx.stdin ?? "").trim() || "Moo. Try: fortune | cowsay";
      for (const l of [...bubble(text, Number(o.W) || 40), ...cow]) ctx.print(l);
      return 0;
    },
  },
  fortune: {
    group: "Fun",
    desc: "print a random, hopefully interesting, adage",
    usage: "fortune",
    run(ctx) {
      const [q, who] = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      const w = Math.min(ctx.cols ?? 80, 72);
      for (const l of wrap(q, w)) ctx.print(l);
      ctx.print(c.gray(`\t\t-- ${who}`));
      return 0;
    },
  },
  lolcat: {
    group: "Fun",
    desc: "rainbow-colour standard input",
    usage: "command | lolcat",
    run(ctx) {
      const text = ctx.args.length ? ctx.args.join(" ") + "\n" : ctx.stdin ?? "";
      const segs = [];
      let i = 0;
      for (const ch of text) {
        if (ch === "\n") {
          segs.push("\n");
          i = Math.floor(i / 8) * 8 + 4;
          continue;
        }
        const hue = (i++ * 7) % 360;
        segs.push(c.hex(`hsl(${hue} 90% 65%)`)(ch));
      }
      ctx.out(flat(segs));
      return 0;
    },
  },
  help: { group: "Shell", builtin: true, desc: "list commands grouped by topic", usage: "help [command]", run: help },
  man: { group: "Shell", desc: "an interface to the system reference manuals", usage: "man command", run: man },
  clear: {
    group: "Shell",
    desc: "clear the terminal screen (Ctrl+L)",
    usage: "clear",
    run(ctx) {
      ctx.term?.clear?.();
      return 0;
    },
  },
  exit: {
    group: "Shell",
    builtin: true,
    desc: "exit the shell (closes the window)",
    usage: "exit [n]",
    run(ctx) {
      ctx.term?.exit?.();
      return Number(ctx.args[0]) || 0;
    },
  },
};
funCommands.reset = { ...funCommands.clear, desc: "reset the terminal", usage: "reset" };
funCommands.top = { ...funCommands.htop, desc: "display processes (same as htop)", usage: "top" };
funCommands.logout = { ...funCommands.exit, usage: "logout" };
