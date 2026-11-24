// Commands that talk to the rest of SherlockOS: windows, apps, settings, notifications.
import { c, dirname } from "../shell.js";
import { getopts, table } from "../lib.js";
import { APPS, getApp } from "../../../os/apps";
import { wm } from "../../../os/windowStore";
import { openPath, openUrl } from "../../../os/open";
import { settings, ACCENTS } from "../../../os/settingsStore";
import { ui, notify } from "../../../os/ui";
import { SYSTEM_PROCS, windowProcs, killPid, usage } from "../procs.js";

const WALLPAPERS = "/home/sherlock/Pictures/Wallpapers";
const ACCENT_NAMES = { purple: ACCENTS[0], blue: ACCENTS[1], green: ACCENTS[2], orange: ACCENTS[3], pink: ACCENTS[4], htb: ACCENTS[5], cyan: ACCENTS[6] };

/** Find an app by id or (case-insensitive) display name, ".app" optional. */
export function findApp(name) {
  const n = String(name).replace(/\.app$/i, "").toLowerCase();
  return (
    getApp(n) ||
    APPS.find((a) => a.name.toLowerCase() === n) ||
    APPS.find((a) => a.name.toLowerCase().replace(/\s+/g, "") === n.replace(/\s+/g, "")) ||
    null
  );
}

const looksLikeUrl = (s) => /^(https?:)?\/\//i.test(s) || /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s);
const toUrl = (s) => (/^https?:/i.test(s) ? s : s.startsWith("//") ? `https:${s}` : `https://${s}`);

export function openTarget(ctx, target, app) {
  if (/^mailto:/i.test(target)) {
    wm.open("mail");
    return 0;
  }
  const p = ctx.resolve(target);
  if (!ctx.fs.exists(p)) {
    if (!app && looksLikeUrl(target)) {
      openUrl(toUrl(target));
      return 0;
    }
    ctx.err(`The file ${p} does not exist.`);
    return 1;
  }
  openPath(p, app ? { app: app.id } : undefined);
  return 0;
}

const EDITORS = ["nano", "vim", "vi", "nvim", "code", "emacs", "gedit", "subl", "mousepad"];

function editor(name) {
  return {
    group: "Desktop",
    desc: name === "code" ? "open a file in TextEdit (VS Code isn't installed)" : `edit a file (opens TextEdit)`,
    usage: `${name} [file]`,
    run(ctx) {
      const file = ctx.args.find((a) => !a.startsWith("-") && !a.startsWith("+"));
      if (!file) {
        wm.open("textedit", {});
        return 0;
      }
      const p = ctx.resolve(file);
      const st = ctx.fs.stat(p);
      if (st?.type === "dir") {
        if (name === "code") return openPath(p), 0;
        ctx.err(`${name}: ${file}: is a directory`);
        return 1;
      }
      if (!st) {
        if (!ctx.fs.isDir(dirname(p))) {
          ctx.err(`${name}: ${file}: No such file or directory`);
          return 1;
        }
        ctx.fs.writeText(p, "");
      } else if (!["text", "markdown", "code", "link", "app", "unknown"].includes(st.kind) || (st.kind === "unknown" && ctx.fs.url(p))) {
        ctx.print(c.gray(`${file} is not a text file - opening it with its default app.`));
        openPath(p);
        return 0;
      }
      wm.open("textedit", { path: p });
      if (name === "vim" || name === "vi" || name === "nvim")
        ctx.print(c.gray("Opened in TextEdit. Good news: you will never need :q! here."));
      return 0;
    },
  };
}

export const desktopCommands = {
  open: {
    group: "Desktop",
    desc: "open files, folders, URLs and apps",
    usage: "open [-a application] [-R] [file | URL ...]",
    opts: [
      ["-a app", "open with the named application (e.g. open -a Safari)"],
      ["-R", "reveal the file in Finder instead of opening it"],
    ],
    run(ctx) {
      const { o, rest } = getopts("open", ctx.args, { flags: "Rne", values: "a", long: { reveal: "R" } });
      let app = null;
      if (o.a) {
        app = findApp(o.a);
        if (!app) return ctx.err(`Unable to find application named '${o.a}'`), 1;
      }
      if (o.e) app = getApp("textedit");
      if (!rest.length) {
        if (app) {
          wm.open(app.id);
          return 0;
        }
        ctx.err("Usage: open [-a <application>] [-R] [file | URL ...]");
        ctx.err(c.gray("Examples: open .   open ~/Documents   open -a Safari   open https://github.com/psychoSherlock"));
        return 1;
      }
      let status = 0;
      for (const t of rest) {
        if (o.R) {
          const p = ctx.resolve(t);
          if (!ctx.fs.exists(p)) {
            ctx.err(`The file ${p} does not exist.`);
            status = 1;
          } else wm.open("finder", { path: ctx.fs.isDir(p) ? p : dirname(p) });
          continue;
        }
        status = openTarget(ctx, t, app) || status;
      }
      return status;
    },
  },
  "xdg-open": {
    group: "Desktop",
    desc: "open a file or URL in the preferred application",
    usage: "xdg-open file | URL",
    run(ctx) {
      if (ctx.args.length !== 1) return ctx.err("xdg-open: unexpected argument count\nTry 'xdg-open --help' for more information."), 1;
      return openTarget(ctx, ctx.args[0]);
    },
  },
  apps: {
    group: "Desktop",
    desc: "list installed applications",
    usage: "apps",
    run(ctx) {
      const running = new Set(windowProcs().map((p) => p.appId));
      const rows = APPS.map((a) => [
        c.link(c.bold(a.name), `app:${a.id}`),
        c.gray(a.id),
        running.has(a.id) ? c.green("running") : "",
      ]);
      for (const l of table(rows)) ctx.print("  ", l);
      ctx.print("");
      ctx.print(c.gray("Launch one with "), c.bold("open -a <name>"), c.gray(" or click its name."));
      return 0;
    },
  },
  theme: {
    group: "Desktop",
    desc: "switch the system appearance",
    usage: "theme [dark|light|toggle]",
    run(ctx) {
      const want = ctx.args[0];
      if (!want) {
        ctx.print(`Appearance: ${c.bold(settings.theme)}`);
        return 0;
      }
      const next = want === "toggle" ? (settings.theme === "dark" ? "light" : "dark") : want;
      if (next !== "dark" && next !== "light") return ctx.err(`theme: unknown appearance '${want}' (use dark, light or toggle)`), 1;
      settings.set({ theme: next });
      ctx.print(`Appearance set to ${c.bold(next)}.`, c.gray(" (the terminal keeps its dark profile)"));
      return 0;
    },
  },
  accent: {
    group: "Desktop",
    desc: "change the system accent colour",
    usage: "accent [#hex | name | --list]",
    run(ctx) {
      const v = ctx.args[0];
      if (!v || v === "--list" || v === "-l") {
        ctx.print("Current accent: ", c.hex(settings.accent)("████"), " ", settings.accent);
        ctx.print("");
        for (const [name, hex] of Object.entries(ACCENT_NAMES)) ctx.print("  ", c.hex(hex)("██"), " ", name.padEnd(8), c.gray(hex));
        ctx.print("");
        ctx.print(c.gray("Usage: accent <name> or accent '#ff79c6'"));
        return 0;
      }
      let hex = ACCENT_NAMES[v.toLowerCase()];
      if (!hex) {
        const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
        if (!m) return ctx.err(`accent: invalid colour '${v}' (try a name from accent --list or a hex like '#ff79c6')`), 1;
        hex = m[1].length === 3 ? `#${[...m[1]].map((x) => x + x).join("")}` : `#${m[1]}`;
      }
      settings.set({ accent: hex.toLowerCase() });
      ctx.print("Accent set to ", c.hex(hex)("████"), " ", hex.toLowerCase());
      return 0;
    },
  },
  wallpaper: {
    group: "Desktop",
    desc: "set or list desktop wallpapers",
    usage: "wallpaper [--list | image-path | https-url]",
    run(ctx) {
      const v = ctx.args[0];
      const list = ctx.fs.list(WALLPAPERS).filter((e) => e.kind === "image");
      if (!v || v === "--list" || v === "-l") {
        for (const e of list) {
          const cur = settings.wallpaper === e.path;
          ctx.print(cur ? c.accent("* ") : "  ", c.link(cur ? c.bold(e.name) : e.name, `fs:${e.path}`));
        }
        ctx.print("");
        ctx.print(c.gray("Usage: wallpaper <name|path>   e.g. wallpaper "), c.bold(list[0]?.name || "kali.jpg"));
        return 0;
      }
      if (/^https?:\/\//i.test(v)) {
        settings.set({ wallpaper: v });
        ctx.print("Wallpaper set to ", v);
        return 0;
      }
      let p = ctx.resolve(v);
      if (!ctx.fs.exists(p) && ctx.fs.exists(`${WALLPAPERS}/${v}`)) p = `${WALLPAPERS}/${v}`;
      const st = ctx.fs.stat(p);
      if (!st) return ctx.err(`wallpaper: ${v}: No such file or directory`), 1;
      if (st.kind !== "image") return ctx.err(`wallpaper: ${v}: not an image`), 1;
      settings.set({ wallpaper: st.path });
      ctx.print("Wallpaper set to ", c.bold(ctx.shell.tilde(st.path)));
      return 0;
    },
  },
  notify: {
    group: "Desktop",
    desc: "post a desktop notification",
    usage: "notify [title] message",
    run(ctx) {
      if (!ctx.args.length) return ctx.err("Usage: notify [title] message"), 1;
      const [title, ...body] = ctx.args.length > 1 ? ctx.args : ["Terminal", ctx.args[0]];
      notify({ title, body: body.join(" "), appId: "terminal" });
      return 0;
    },
  },
  lock: {
    group: "Desktop",
    desc: "lock the screen",
    usage: "lock",
    run() {
      document.activeElement?.blur?.();
      ui.setLocked(true);
      return 0;
    },
  },
  reboot: {
    group: "Desktop",
    desc: "restart SherlockOS (replays the boot sequence)",
    usage: "reboot",
    async run(ctx) {
      ctx.print("");
      ctx.print(c.bold(`Broadcast message from ${ctx.shell.user}@${ctx.shell.host} (pts/0):`));
      ctx.print("");
      ctx.print(`The system will ${ctx.name === "reboot" ? "reboot" : "power off"} now!`);
      await ctx.sleep(900);
      window.location.hash = "#/";
      return 0;
    },
  },
  ps: {
    group: "System",
    desc: "report a snapshot of the current processes (windows)",
    usage: "ps [aux | -e | -ef]",
    run(ctx) {
      const all = ctx.args.some((a) => /^-?[aeAx]/.test(a));
      const wins = windowProcs();
      const self = wins.find((p) => p.windowId === ctx.term?.windowId);
      if (!all) {
        const rows = [["PID", "TTY", "TIME", "CMD"]];
        if (self) rows.push([String(self.pid), "pts/0", "00:00:00", "zsh"]);
        rows.push([String((self?.pid || 1000) + 1), "pts/0", "00:00:00", "ps"]);
        for (const l of table(rows, { align: ["right"] })) ctx.print(l);
        return 0;
      }
      const rows = [["USER", "PID", "%CPU", "%MEM", "VSZ", "RSS", "TTY", "STAT", "COMMAND"].map((h) => c.bold(h))];
      for (const p of [...SYSTEM_PROCS, ...wins]) {
        const u = usage(p);
        rows.push([
          p.user,
          String(p.pid),
          u.cpu.toFixed(1),
          u.mem.toFixed(1),
          String(u.virt),
          String(u.rss),
          p.windowId ? "pts/0" : "?",
          p.windowId ? (p.minimized ? "T" : "Sl") : "Ss",
          p.windowId ? c.link(p.cmd, `app:${p.appId}`) : p.cmd,
        ]);
      }
      for (const l of table(rows, { align: ["", "right", "right", "right", "right", "right"] })) ctx.print(l);
      return 0;
    },
  },
  kill: {
    group: "System",
    builtin: true,
    desc: "send a signal to a process (closes that window)",
    usage: "kill [-9|-s signal] pid ...",
    run(ctx) {
      if (ctx.args[0] === "-l") {
        ctx.print("HUP INT QUIT ILL TRAP ABRT BUS FPE KILL USR1 SEGV USR2 PIPE ALRM TERM STKFLT CHLD CONT STOP TSTP TTIN TTOU URG XCPU XFSZ VTALRM PROF WINCH POLL PWR SYS");
        return 0;
      }
      const pids = [];
      for (let i = 0; i < ctx.args.length; i++) {
        const a = ctx.args[i];
        if (a === "-s" || a === "-n") i++;
        else if (!a.startsWith("-")) pids.push(a);
      }
      if (!pids.length) return ctx.err("kill: not enough arguments"), 1;
      let status = 0;
      for (const a of pids) {
        const pid = Number(a);
        if (!Number.isInteger(pid)) {
          ctx.err(`kill: illegal pid: ${a}`);
          status = 1;
          continue;
        }
        const e = killPid(pid);
        if (e) {
          ctx.err(`kill: kill ${pid} failed: ${e}`);
          status = 1;
        }
      }
      return status;
    },
  },
  killall: {
    group: "System",
    desc: "kill processes by name (closes every window of an app)",
    usage: "killall name",
    run(ctx) {
      if (!ctx.args.length) return ctx.err("Usage: killall [-signal] name ..."), 1;
      let status = 0;
      for (const n of ctx.args.filter((a) => !a.startsWith("-"))) {
        const app = findApp(n) || (n === "zsh" ? getApp("terminal") : null);
        const procs = windowProcs().filter((p) => app && p.appId === app.id);
        if (!procs.length) {
          ctx.err(`${n}: no process found`);
          status = 1;
        }
        procs.forEach((p) => wm.close(p.windowId));
      }
      return status;
    },
  },
  ...Object.fromEntries(EDITORS.map((n) => [n, editor(n)])),
};

desktopCommands.shutdown = { ...desktopCommands.reboot, desc: "power off SherlockOS (back to the boot menu)", usage: "shutdown [now]" };
desktopCommands.poweroff = { ...desktopCommands.shutdown, usage: "poweroff" };

