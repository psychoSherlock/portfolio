// Core Unix commands. Pure: they only touch ctx (ctx.fs is the injected virtual filesystem),
// so they run under node as well as in the browser.
import { c, flat, plain, columnize, basename, dirname, ShellError, quote } from "../shell.js";
import {
  getopts, human, lsDate, perms, lsStyle, padL, padR, wrap, globRe, hash, byteLen, lines,
  strftime, defaultDate, uptimeText, MONTHS_LONG, table,
} from "../lib.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const TEXT_KINDS = new Set(["text", "markdown", "code", "link", "app"]);
export const isBinary = (fs, st) => st.type === "file" && !TEXT_KINDS.has(st.kind) && !!fs.url(st.path);

/** Read the named files (or stdin) as text. Errors are printed; returns [{ name, text }] + status. */
async function readInputs(ctx, cmd, files, { binaryHint = false } = {}) {
  if (!files.length) return { inputs: [{ name: "-", text: ctx.stdin ?? "" }], status: 0 };
  const inputs = [];
  let status = 0;
  for (const f of files) {
    if (f === "-") {
      inputs.push({ name: "-", text: ctx.stdin ?? "" });
      continue;
    }
    const st = ctx.fs.stat(ctx.resolve(f));
    if (!st) {
      ctx.err(`${cmd}: ${f}: No such file or directory`);
      status = 1;
    } else if (st.type === "dir") {
      ctx.err(`${cmd}: ${f}: Is a directory`);
      status = 1;
    } else if (isBinary(ctx.fs, st)) {
      if (binaryHint)
        ctx.err(
          `${cmd}: ${f}: binary file (${st.kind === "unknown" ? "data" : st.kind}) - try `,
          c.bold(`open ${quote(f)}`),
          " to view it"
        );
      else ctx.err(`${cmd}: ${f}: binary file matches nothing printable`);
      status = 1;
    } else {
      inputs.push({ name: f, text: await ctx.fs.readText(st.path) });
    }
  }
  return { inputs, status };
}

/** Bytes of a file (binary assets are fetched). */
export async function readBytes(ctx, path) {
  const url = ctx.fs.url(path);
  const st = ctx.fs.stat(path);
  if (url && !TEXT_KINDS.has(st.kind)) {
    const res = await fetch(url, { signal: ctx.signal });
    return new Uint8Array(await res.arrayBuffer());
  }
  return new TextEncoder().encode(await ctx.fs.readText(path));
}

const lsName = (name, tty) => (tty && /[\s'"$`\\!*?&;|<>(){}[\]#~]/.test(name) ? quote(name) : name);

function styledName(st, label, tty) {
  const style = lsStyle(st);
  const text = lsName(label ?? st.name, tty);
  return style && tty ? { t: text, s: style } : { t: text };
}

const NAME_SORT = (a, b) =>
  a.name.replace(/^\.+/, "").localeCompare(b.name.replace(/^\.+/, ""), "en", { sensitivity: "base", numeric: false }) ||
  a.name.localeCompare(b.name);

/** Disk usage in 1K blocks (4K block size like ext4). */
const blocks = (st) => (st.type === "dir" ? 4 : Math.ceil((st.size || 0) / 4096) * 4);

function cmdNotFoundHint(name) {
  return `${name} not found`;
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------
export const coreCommands = {
  // ---- navigation ---------------------------------------------------------
  cd: {
    group: "Files",
    builtin: true,
    desc: "change the working directory",
    usage: "cd [-|~|dir]",
    run(ctx) {
      const args = ctx.args.filter((a) => a !== "-P" && a !== "-L");
      if (args.length > 1) return ctx.err(`cd: string not in pwd: ${args[0]}`), 1;
      let target = args[0] ?? "~";
      if (target === "-") target = ctx.shell.env.OLDPWD || ctx.shell.cwd;
      const p = ctx.resolve(target);
      const st = ctx.fs.stat(p);
      if (!st) return ctx.err(`cd: no such file or directory: ${args[0]}`), 1;
      if (st.type !== "dir") return ctx.err(`cd: not a directory: ${args[0]}`), 1;
      ctx.shell.setCwd(p);
      if (args[0] === "-") ctx.print(ctx.shell.tilde(p));
      return 0;
    },
  },
  pwd: {
    group: "Files",
    builtin: true,
    desc: "print name of current directory",
    usage: "pwd [-LP]",
    run(ctx) {
      ctx.print(ctx.shell.cwd);
      return 0;
    },
  },
  ls: {
    group: "Files",
    desc: "list directory contents",
    usage: "ls [-1aAdFhlrRSt] [file ...]",
    opts: [
      ["-a", "do not ignore entries starting with ."],
      ["-A", "like -a, but omit . and .."],
      ["-l", "use a long listing format"],
      ["-h", "with -l, print sizes like 1K 234M 2G"],
      ["-R", "list subdirectories recursively"],
      ["-t", "sort by modification time, newest first"],
      ["-S", "sort by file size, largest first"],
      ["-r", "reverse order while sorting"],
      ["-d", "list directories themselves, not their contents"],
      ["-F", "append indicator (one of */) to entries"],
      ["-1", "list one file per line"],
    ],
    run(ctx) {
      const { o, rest } = getopts("ls", ctx.args, {
        flags: "1aAdFhlrRStC",
        long: {
          all: "a", "almost-all": "A", directory: "d", classify: "F", "human-readable": "h",
          reverse: "r", recursive: "R", color: "C",
        },
      });
      const { fs } = ctx;
      const tty = ctx.tty;
      let status = 0;
      const sortEntries = (list) => {
        const s = [...list];
        if (o.t) s.sort((a, b) => (b.mtime || 0) - (a.mtime || 0) || NAME_SORT(a, b));
        else if (o.S) s.sort((a, b) => (b.size || 0) - (a.size || 0) || NAME_SORT(a, b));
        else s.sort(NAME_SORT);
        if (o.r) s.reverse();
        return s;
      };
      const suffix = (st) => (o.F ? (st.type === "dir" ? "/" : /^(sh|py)$/.test(st.ext) ? "*" : "") : "");

      const render = (entries, withTotal) => {
        if (!entries.length) return;
        if (o.l) {
          if (withTotal) ctx.print(`total ${entries.reduce((n, e) => n + blocks(e), 0)}`);
          const rows = entries.map((e) => {
            const links = e.type === "dir" ? 2 + fs.list(e.path, { hidden: true }).filter((x) => x.type === "dir").length : 1;
            const size = e.type === "dir" ? 4096 : e.size || 0;
            const owner = e.path.startsWith(ctx.shell.home) ? ctx.shell.user : "root";
            return [
              perms(e),
              padL(links, 1),
              owner,
              owner,
              o.h ? human(size) : String(size),
              lsDate(e.mtime),
              flat([styledName(e, e.label, tty), suffix(e)]),
            ];
          });
          const w = rows[0].map((_, i) => Math.max(...rows.map((r) => (typeof r[i] === "string" ? r[i].length : 0))));
          for (const r of rows)
            ctx.print(
              r[0], " ", padL(r[1], w[1]), " ", padR(r[2], w[2]), " ", padR(r[3], w[3]), " ",
              padL(r[4], w[4]), " ", r[5], " ", r[6]
            );
          return;
        }
        if (!tty || o["1"]) {
          for (const e of entries) ctx.print(styledName(e, e.label, tty), suffix(e));
          return;
        }
        const cells = entries.map((e) => {
          const seg = flat([styledName(e, e.label, tty), suffix(e)]);
          return { text: plain(seg), seg };
        });
        for (const line of columnize(cells, ctx.cols)) ctx.print(line);
      };

      const listDir = (p) => {
        let entries = fs.list(p, { hidden: o.a || o.A });
        entries = sortEntries(entries);
        if (o.a && !o.A) {
          const self = fs.stat(p);
          const parent = fs.stat(dirname(p));
          entries = [{ ...self, label: "." }, { ...parent, label: ".." }, ...entries];
        }
        return entries;
      };

      const targets = rest.length ? rest : ["."];
      const files = [];
      const dirs = [];
      for (const t of targets) {
        const st = fs.stat(ctx.resolve(t));
        if (!st) {
          ctx.err(`ls: cannot access '${t}': No such file or directory`);
          status = 2;
        } else if (st.type === "dir" && !o.d) dirs.push({ t, st });
        else files.push({ ...st, label: t });
      }
      render(sortEntries(files), false);
      const showHeaders = targets.length > 1 || o.R;
      let first = files.length === 0;
      const visit = (label, p) => {
        ctx.checkAbort();
        if (!first) ctx.print("");
        first = false;
        if (showHeaders) ctx.print(lsName(label, tty), ":");
        const entries = listDir(p);
        render(entries, true);
        if (o.R) {
          for (const e of entries) {
            if (e.type === "dir" && !e.label) visit(label === "/" ? `/${e.name}` : `${label}/${e.name}`, e.path);
          }
        }
      };
      for (const d of dirs.sort((a, b) => a.t.localeCompare(b.t))) visit(d.t, d.st.path);
      return status;
    },
  },
  tree: {
    group: "Files",
    desc: "list contents of directories in a tree-like format",
    usage: "tree [-a] [-d] [-L level] [dir ...]",
    opts: [
      ["-a", "all files are listed"],
      ["-d", "list directories only"],
      ["-L level", "descend only level directories deep"],
    ],
    run(ctx) {
      const { o, rest } = getopts("tree", ctx.args, { flags: "adf", values: "L" });
      const max = o.L != null ? Number(o.L) : Infinity;
      if (o.L != null && !(max > 0)) return ctx.err("tree: Invalid level, must be greater than 0."), 1;
      let nd = 0;
      let nf = 0;
      const walk = (p, prefix, depth) => {
        if (depth > max) return;
        ctx.checkAbort();
        let entries = ctx.fs.list(p, { hidden: !!o.a }).sort(NAME_SORT);
        if (o.d) entries = entries.filter((e) => e.type === "dir");
        entries.forEach((e, i) => {
          const last = i === entries.length - 1;
          ctx.print(c.gray(prefix + (last ? "└── " : "├── ")), styledName(e, null, ctx.tty));
          if (e.type === "dir") {
            nd++;
            walk(e.path, prefix + (last ? "    " : "│   "), depth + 1);
          } else nf++;
        });
      };
      let status = 0;
      for (const t of rest.length ? rest : ["."]) {
        const st = ctx.fs.stat(ctx.resolve(t));
        if (!st || st.type !== "dir") {
          ctx.print(t, c.red(" [error opening dir]"));
          status = 2;
          continue;
        }
        ctx.print(c.blue(c.bold(t)));
        walk(st.path, "", 1);
      }
      ctx.print("");
      ctx.print(`${nd} director${nd === 1 ? "y" : "ies"}${o.d ? "" : `, ${nf} file${nf === 1 ? "" : "s"}`}`);
      return status;
    },
  },
  find: {
    group: "Files",
    desc: "search for files in a directory hierarchy",
    usage: "find [path ...] [-name pattern] [-iname pattern] [-type f|d] [-maxdepth n] [-mindepth n]",
    run(ctx) {
      const paths = [];
      let i = 0;
      while (i < ctx.args.length && !ctx.args[i].startsWith("-")) paths.push(ctx.args[i++]);
      const tests = [];
      let maxdepth = Infinity;
      let mindepth = 0;
      while (i < ctx.args.length) {
        const a = ctx.args[i++];
        const v = ctx.args[i];
        const need = () => {
          if (v == null) throw new ShellError(`find: missing argument to \`${a}'`);
          i++;
          return v;
        };
        if (a === "-name" || a === "-iname") {
          const re = globRe(need(), a === "-iname" ? "i" : "");
          tests.push((st) => re.test(st.name));
        } else if (a === "-type") {
          const t = need();
          if (t !== "f" && t !== "d") throw new ShellError(`find: Unknown argument to -type: ${t}`);
          tests.push((st) => (t === "d" ? st.type === "dir" : st.type === "file"));
        } else if (a === "-maxdepth") maxdepth = Number(need());
        else if (a === "-mindepth") mindepth = Number(need());
        else if (a === "-empty") tests.push((st) => (st.type === "dir" ? !ctx.fs.list(st.path, { hidden: true }).length : !st.size));
        else if (a === "-print") continue;
        else throw new ShellError(`find: unknown predicate \`${a}'`);
      }
      let status = 0;
      const match = (st) => tests.every((t) => t(st));
      const visit = (st, shown, depth) => {
        ctx.checkAbort();
        if (depth >= mindepth && match(st)) ctx.print(st.type === "dir" && ctx.tty ? c.blue(c.bold(shown)) : shown);
        if (st.type === "dir" && depth < maxdepth) {
          for (const e of ctx.fs.list(st.path, { hidden: true })) {
            visit(e, shown.endsWith("/") ? shown + e.name : `${shown}/${e.name}`, depth + 1);
          }
        }
      };
      for (const p of paths.length ? paths : ["."]) {
        const st = ctx.fs.stat(ctx.resolve(p));
        if (!st) {
          ctx.err(`find: '${p}': No such file or directory`);
          status = 1;
        } else visit(st, p, 0);
      }
      return status;
    },
  },
  du: {
    group: "Files",
    desc: "estimate file space usage",
    usage: "du [-ahsc] [file ...]",
    opts: [
      ["-a", "write counts for all files, not just directories"],
      ["-h", "print sizes in human readable format"],
      ["-s", "display only a total for each argument"],
      ["-c", "produce a grand total"],
    ],
    run(ctx) {
      const { o, rest } = getopts("du", ctx.args, { flags: "ahsck", long: { "human-readable": "h", summarize: "s", all: "a", total: "c" } });
      const fmt = (k) => (o.h ? human(k * 1024) : String(k));
      let grand = 0;
      let status = 0;
      const size = (st, shown, depth) => {
        if (st.type === "file") {
          const b = blocks(st);
          if (o.a && !o.s && depth > 0) ctx.print(fmt(b), "\t", shown);
          return b;
        }
        let total = 4;
        for (const e of ctx.fs.list(st.path, { hidden: true })) total += size(e, `${shown.replace(/\/$/, "")}/${e.name}`, depth + 1);
        if (!o.s || depth === 0) ctx.print(fmt(total), "\t", shown);
        return total;
      };
      for (const t of rest.length ? rest : ["."]) {
        const st = ctx.fs.stat(ctx.resolve(t));
        if (!st) {
          ctx.err(`du: cannot access '${t}': No such file or directory`);
          status = 1;
          continue;
        }
        const b = size(st, t, 0);
        if (st.type === "file") ctx.print(fmt(b), "\t", t);
        grand += b;
      }
      if (o.c) ctx.print(fmt(grand), "\ttotal");
      return status;
    },
  },
  stat: {
    group: "Files",
    desc: "display file status",
    usage: "stat file ...",
    run(ctx) {
      if (!ctx.args.length) return ctx.err("stat: missing operand\nTry 'stat --help' for more information."), 1;
      let status = 0;
      for (const f of ctx.args) {
        const st = ctx.fs.stat(ctx.resolve(f));
        if (!st) {
          ctx.err(`stat: cannot statx '${f}': No such file or directory`);
          status = 1;
          continue;
        }
        const size = st.type === "dir" ? 4096 : st.size || 0;
        const p = perms(st);
        const mode = st.type === "dir" || p[3] === "x" ? "0755" : "0644";
        const owner = st.path.startsWith(ctx.shell.home) ? ctx.shell.user : "root";
        const uid = owner === "root" ? 0 : 1000;
        const ts = strftime("%F %T.000000000 %z", new Date(st.mtime || Date.now()));
        ctx.print(`  File: ${f}`);
        ctx.print(`  Size: ${padR(size, 15)} Blocks: ${padR(blocks(st) * 2, 10)} IO Block: 4096   ${st.type === "dir" ? "directory" : size ? "regular file" : "regular empty file"}`);
        ctx.print(`Device: 0,42\tInode: ${padR(hash(st.path) % 9000000 + 100000, 11)} Links: ${st.type === "dir" ? 2 : 1}`);
        ctx.print(`Access: (${mode}/${p})  Uid: (${padL(uid, 5)}/${padL(owner, 8)})   Gid: (${padL(uid, 5)}/${padL(owner, 8)})`);
        ctx.print(`Access: ${ts}`);
        ctx.print(`Modify: ${ts}`);
        ctx.print(`Change: ${ts}`);
        ctx.print(` Birth: ${ts}`);
      }
      return status;
    },
  },
  file: {
    group: "Files",
    desc: "determine file type",
    usage: "file file ...",
    async run(ctx) {
      if (!ctx.args.length) return ctx.err("Usage: file [-bchikLlNnprsSvzZ0] [--apple] [--extension] [--mime-encoding] [--mime-type] file ..."), 1;
      const w = Math.max(...ctx.args.map((a) => a.length)) + 1;
      for (const f of ctx.args) {
        const st = ctx.fs.stat(ctx.resolve(f));
        let desc;
        if (!st) desc = `cannot open \`${f}' (No such file or directory)`;
        else if (st.type === "dir") desc = "directory";
        else {
          const binary = isBinary(ctx.fs, st);
          const text = binary ? "" : await ctx.fs.readText(st.path);
          // eslint-disable-next-line no-control-regex
          const enc = /[^\x00-\x7f]/.test(text) ? "Unicode text, UTF-8 text" : "ASCII text";
          const byExt = {
            jpg: "JPEG image data, JFIF standard 1.01", jpeg: "JPEG image data, JFIF standard 1.01",
            png: "PNG image data, 8-bit/color RGBA, non-interlaced", gif: "GIF image data, version 89a",
            webp: "RIFF (little-endian) data, Web/P image", svg: "SVG Scalable Vector Graphics image",
            pdf: "PDF document, version 1.7", mp3: "Audio file with ID3 version 2.4.0",
            mp4: "ISO Media, MP4 Base Media v1 [ISO 14496-12:2003]", webm: "WebM",
            json: "JSON text data", webloc: "JSON text data", app: "JSON text data",
            js: `JavaScript source, ${enc}`, jsx: `JavaScript source, ${enc}`, py: `Python script, ${enc} executable`,
            sh: `Bourne-Again shell script, ${enc} executable`, html: `HTML document, ${enc}`,
            md: enc, txt: enc, css: enc,
          };
          desc = st.size === 0 && !binary ? "empty" : byExt[st.ext] || (binary ? "data" : enc);
        }
        ctx.print(padR(`${f}:`, w), " ", desc);
      }
      return 0;
    },
  },

  // ---- file manipulation --------------------------------------------------
  touch: {
    group: "Files",
    desc: "create empty files",
    usage: "touch file ...",
    run(ctx) {
      const { rest } = getopts("touch", ctx.args, { flags: "acm" });
      if (!rest.length) return ctx.err("touch: missing file operand\nTry 'touch --help' for more information."), 1;
      let status = 0;
      for (const f of rest) {
        const p = ctx.resolve(f);
        if (ctx.fs.exists(p)) continue;
        if (!ctx.fs.isDir(dirname(p))) {
          ctx.err(`touch: cannot touch '${f}': No such file or directory`);
          status = 1;
          continue;
        }
        ctx.fs.writeText(p, "");
      }
      return status;
    },
  },
  mkdir: {
    group: "Files",
    desc: "make directories",
    usage: "mkdir [-pv] directory ...",
    opts: [["-p", "no error if existing, make parent directories as needed"], ["-v", "print a message for each created directory"]],
    run(ctx) {
      const { o, rest } = getopts("mkdir", ctx.args, { flags: "pv", long: { parents: "p", verbose: "v" } });
      if (!rest.length) return ctx.err("mkdir: missing operand\nTry 'mkdir --help' for more information."), 1;
      let status = 0;
      for (const d of rest) {
        const p = ctx.resolve(d);
        if (ctx.fs.exists(p)) {
          if (!o.p || !ctx.fs.isDir(p)) {
            ctx.err(`mkdir: cannot create directory '${d}': File exists`);
            status = 1;
          }
          continue;
        }
        if (!o.p && !ctx.fs.isDir(dirname(p))) {
          ctx.err(`mkdir: cannot create directory '${d}': No such file or directory`);
          status = 1;
          continue;
        }
        if (ctx.fs.isFile(dirname(p))) {
          ctx.err(`mkdir: cannot create directory '${d}': Not a directory`);
          status = 1;
          continue;
        }
        ctx.fs.mkdir(p);
        if (o.v) ctx.print(`mkdir: created directory '${d}'`);
      }
      return status;
    },
  },
  rmdir: {
    group: "Files",
    desc: "remove empty directories",
    usage: "rmdir directory ...",
    run(ctx) {
      const { rest } = getopts("rmdir", ctx.args, { flags: "pv" });
      if (!rest.length) return ctx.err("rmdir: missing operand\nTry 'rmdir --help' for more information."), 1;
      let status = 0;
      for (const d of rest) {
        const p = ctx.resolve(d);
        const st = ctx.fs.stat(p);
        let msg = null;
        if (!st) msg = "No such file or directory";
        else if (st.type !== "dir") msg = "Not a directory";
        else if (ctx.fs.list(p, { hidden: true }).length) msg = "Directory not empty";
        else if (!ctx.fs.remove(p)) msg = "Operation not permitted";
        if (msg) {
          ctx.err(`rmdir: failed to remove '${d}': ${msg}`);
          status = 1;
        }
      }
      return status;
    },
  },
  rm: {
    group: "Files",
    desc: "remove files or directories",
    usage: "rm [-rfv] file ...",
    opts: [
      ["-f", "ignore nonexistent files, never prompt"],
      ["-r, -R", "remove directories and their contents recursively"],
      ["-v", "explain what is being done"],
    ],
    run(ctx) {
      const { o, rest } = getopts("rm", ctx.args, {
        flags: "rRfvid",
        long: { recursive: "r", force: "f", verbose: "v", "no-preserve-root": "N", "preserve-root": "P" },
      });
      const recursive = o.r || o.R;
      if (!rest.length) {
        if (o.f) return 0;
        return ctx.err("rm: missing operand\nTry 'rm --help' for more information."), 1;
      }
      let status = 0;
      for (const f of rest) {
        const p = ctx.resolve(f);
        if (p === "/") {
          if (!recursive) {
            ctx.err(`rm: cannot remove '${f}': Is a directory`);
          } else if (!o.N) {
            ctx.err("rm: it is dangerous to operate recursively on '/'");
            ctx.err("rm: use --no-preserve-root to override this failsafe");
          } else {
            ctx.err(c.red("rm: nice try."), " This portfolio is the only copy of its author's work,");
            ctx.err("    and SherlockOS has a strict no-self-destruct policy. Try ", c.bold("reboot"), " instead.");
          }
          status = 1;
          continue;
        }
        const st = ctx.fs.stat(p);
        if (!st) {
          if (!o.f) {
            ctx.err(`rm: cannot remove '${f}': No such file or directory`);
            status = 1;
          }
          continue;
        }
        if (st.type === "dir" && !recursive) {
          ctx.err(`rm: cannot remove '${f}': Is a directory`);
          status = 1;
          continue;
        }
        if (p === ctx.shell.home || ctx.shell.cwd === p || ctx.shell.cwd.startsWith(p + "/")) {
          ctx.err(`rm: refusing to remove '${f}': it contains the current working directory`);
          status = 1;
          continue;
        }
        if (!ctx.fs.remove(p)) {
          ctx.err(`rm: cannot remove '${f}': Operation not permitted`);
          status = 1;
          continue;
        }
        if (o.v) ctx.print(st.type === "dir" ? `removed directory '${f}'` : `removed '${f}'`);
      }
      return status;
    },
  },
  mv: {
    group: "Files",
    desc: "move (rename) files",
    usage: "mv [-fnv] source ... dest",
    run(ctx) {
      const { o, rest } = getopts("mv", ctx.args, { flags: "fnvi", long: { force: "f", "no-clobber": "n", verbose: "v" } });
      if (rest.length < 2) {
        ctx.err(rest.length ? `mv: missing destination file operand after '${rest[0]}'` : "mv: missing file operand");
        ctx.err("Try 'mv --help' for more information.");
        return 1;
      }
      const dest = rest.pop();
      const dp = ctx.resolve(dest);
      const destDir = ctx.fs.isDir(dp);
      if (rest.length > 1 && !destDir) return ctx.err(`mv: target '${dest}': Not a directory`), 1;
      let status = 0;
      for (const s of rest) {
        const sp = ctx.resolve(s);
        if (!ctx.fs.exists(sp)) {
          ctx.err(`mv: cannot stat '${s}': No such file or directory`);
          status = 1;
          continue;
        }
        const target = destDir ? `${dp === "/" ? "" : dp}/${basename(sp)}` : dp;
        if (target === sp) {
          ctx.err(`mv: '${s}' and '${dest}' are the same file`);
          status = 1;
          continue;
        }
        if (target.startsWith(sp + "/")) {
          ctx.err(`mv: cannot move '${s}' to a subdirectory of itself, '${dest}'`);
          status = 1;
          continue;
        }
        if (ctx.fs.exists(target)) {
          if (o.n) continue;
          if (ctx.fs.isDir(target)) {
            ctx.err(`mv: cannot overwrite directory '${target}'`);
            status = 1;
            continue;
          }
          ctx.fs.remove(target);
        } else if (!ctx.fs.isDir(dirname(target))) {
          ctx.err(`mv: cannot move '${s}' to '${dest}': No such file or directory`);
          status = 1;
          continue;
        }
        if (!ctx.fs.move(sp, target)) {
          ctx.err(`mv: cannot move '${s}': Operation not permitted`);
          status = 1;
          continue;
        }
        if (sp === ctx.shell.cwd || ctx.shell.cwd.startsWith(sp + "/")) ctx.shell.setCwd(target + ctx.shell.cwd.slice(sp.length));
        if (o.v) ctx.print(`renamed '${s}' -> '${ctx.shell.tilde(target)}'`);
      }
      return status;
    },
  },
  cp: {
    group: "Files",
    desc: "copy files and directories",
    usage: "cp [-rv] source ... dest",
    opts: [["-r, -R", "copy directories recursively"], ["-v", "explain what is being done"]],
    run(ctx) {
      const { o, rest } = getopts("cp", ctx.args, { flags: "rRvfnai", long: { recursive: "r", verbose: "v", force: "f" } });
      if (rest.length < 2) {
        ctx.err(rest.length ? `cp: missing destination file operand after '${rest[0]}'` : "cp: missing file operand");
        ctx.err("Try 'cp --help' for more information.");
        return 1;
      }
      const recursive = o.r || o.R || o.a;
      const dest = rest.pop();
      const dp = ctx.resolve(dest);
      const destDir = ctx.fs.isDir(dp);
      if (rest.length > 1 && !destDir) return ctx.err(`cp: target '${dest}': Not a directory`), 1;
      let status = 0;
      for (const s of rest) {
        const sp = ctx.resolve(s);
        const st = ctx.fs.stat(sp);
        if (!st) {
          ctx.err(`cp: cannot stat '${s}': No such file or directory`);
          status = 1;
          continue;
        }
        if (st.type === "dir" && !recursive) {
          ctx.err(`cp: -r not specified; omitting directory '${s}'`);
          status = 1;
          continue;
        }
        const target = destDir ? `${dp === "/" ? "" : dp}/${basename(sp)}` : dp;
        if (target === sp) {
          ctx.err(`cp: '${s}' and '${dest}' are the same file`);
          status = 1;
          continue;
        }
        if (target.startsWith(sp + "/")) {
          ctx.err(`cp: cannot copy a directory, '${s}', into itself, '${dest}'`);
          status = 1;
          continue;
        }
        if (!ctx.fs.isDir(dirname(target))) {
          ctx.err(`cp: cannot create regular file '${dest}': No such file or directory`);
          status = 1;
          continue;
        }
        if (ctx.fs.isFile(target)) {
          if (o.n) continue;
          ctx.fs.remove(target);
        }
        ctx.fs.copy(sp, target);
        if (o.v) ctx.print(`'${s}' -> '${ctx.shell.tilde(target)}'`);
      }
      return status;
    },
  },

  // ---- reading text -------------------------------------------------------
  cat: {
    group: "Text",
    desc: "concatenate files and print on the standard output",
    usage: "cat [-nbs] [file ...]",
    opts: [["-n", "number all output lines"], ["-b", "number nonempty output lines"], ["-s", "suppress repeated empty output lines"]],
    async run(ctx) {
      const { o, rest } = getopts("cat", ctx.args, { flags: "nbsAE", long: { number: "n", "number-nonblank": "b", "squeeze-blank": "s" } });
      const { inputs, status } = await readInputs(ctx, "cat", rest, { binaryHint: true });
      let text = inputs.map((i) => i.text).join("");
      if (o.s) text = text.replace(/\n{3,}/g, "\n\n");
      if (o.n || o.b) {
        let n = 0;
        const ls = lines(text);
        text = ls.map((l) => (o.b && !l ? "" : `${padL(++n, 6)}\t${l}`)).join("\n") + (ls.length ? "\n" : "");
      }
      if (text) ctx.out(text);
      return status;
    },
  },
  head: {
    group: "Text",
    desc: "output the first part of files",
    usage: "head [-n lines] [-c bytes] [file ...]",
    async run(ctx) {
      const { o, rest } = getopts("head", ctx.args, { flags: "qv", values: "nc", numeric: "n", long: { lines: "n", bytes: "c" } });
      const n = Number(o.n ?? 10);
      if (!Number.isFinite(n)) return ctx.err(`head: invalid number of lines: '${o.n}'`), 1;
      const { inputs, status } = await readInputs(ctx, "head", rest);
      inputs.forEach((inp, i) => {
        if (inputs.length > 1) ctx.print(i ? "\n" : "", `==> ${inp.name} <==`);
        if (o.c != null) return ctx.out(inp.text.slice(0, Number(o.c)));
        const ls = lines(inp.text);
        const pick = n < 0 ? ls.slice(0, n) : ls.slice(0, n);
        if (pick.length) ctx.out(pick.join("\n") + "\n");
      });
      return status;
    },
  },
  tail: {
    group: "Text",
    desc: "output the last part of files",
    usage: "tail [-n [+]lines] [file ...]",
    async run(ctx) {
      const { o, rest } = getopts("tail", ctx.args, { flags: "qvf", values: "nc", numeric: "n", long: { lines: "n", bytes: "c" } });
      const spec = String(o.n ?? "10");
      const fromStart = spec.startsWith("+");
      const n = Math.abs(Number(spec));
      if (!Number.isFinite(n)) return ctx.err(`tail: invalid number of lines: '${o.n}'`), 1;
      const { inputs, status } = await readInputs(ctx, "tail", rest);
      inputs.forEach((inp, i) => {
        if (inputs.length > 1) ctx.print(i ? "\n" : "", `==> ${inp.name} <==`);
        if (o.c != null) return ctx.out(inp.text.slice(-Number(o.c)));
        const ls = lines(inp.text);
        const pick = fromStart ? ls.slice(Math.max(0, n - 1)) : n === 0 ? [] : ls.slice(-n);
        if (pick.length) ctx.out(pick.join("\n") + "\n");
      });
      return status;
    },
  },
  grep: {
    group: "Text",
    desc: "print lines that match patterns",
    usage: "grep [-cEFhHilnoqrvw] pattern [file ...]",
    opts: [
      ["-i", "ignore case distinctions"],
      ["-n", "print line number with output lines"],
      ["-r, -R", "search directories recursively"],
      ["-v", "select non-matching lines"],
      ["-c", "print only a count of selected lines per file"],
      ["-l", "print only names of files with selected lines"],
      ["-o", "show only nonempty parts of lines that match"],
      ["-w", "match only whole words"],
      ["-F", "pattern is a fixed string"],
      ["-q", "quiet; exit status only"],
    ],
    async run(ctx) {
      const { o, rest } = getopts("grep", ctx.args, {
        flags: "cEFhHilnoqrRsvw",
        values: "e",
        long: {
          "ignore-case": "i", "line-number": "n", recursive: "r", "invert-match": "v", count: "c",
          "files-with-matches": "l", "only-matching": "o", "word-regexp": "w", "fixed-strings": "F",
          quiet: "q", silent: "q", "no-filename": "h", "with-filename": "H", color: "E", colour: "E",
        },
      });
      const files = [...rest];
      const pattern = o.e ?? files.shift();
      if (pattern == null) {
        ctx.err("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.");
        return 2;
      }
      let src = o.F ? pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : pattern;
      if (o.w) src = `\\b(?:${src})\\b`;
      let re;
      try {
        re = new RegExp(src, o.i ? "gi" : "g");
      } catch {
        re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), o.i ? "gi" : "g");
      }
      const recursive = o.r || o.R;
      let status = 2;
      let any = false;
      let error = false;
      const targets = [];
      if (!files.length) {
        if (recursive) files.push(".");
        else targets.push({ name: "(standard input)", text: ctx.stdin ?? "" });
      }
      for (const f of files) {
        if (f === "-") {
          targets.push({ name: "(standard input)", text: ctx.stdin ?? "" });
          continue;
        }
        const st = ctx.fs.stat(ctx.resolve(f));
        if (!st) {
          if (!o.s) ctx.err(`grep: ${f}: No such file or directory`);
          error = true;
        } else if (st.type === "dir") {
          if (!recursive) {
            ctx.err(`grep: ${f}: Is a directory`);
            error = true;
            continue;
          }
          const walk = (dir, shown) => {
            for (const e of ctx.fs.list(dir, { hidden: false }).sort(NAME_SORT)) {
              const name = shown === "." && !f.startsWith("./") && f === "." ? e.name : `${shown.replace(/\/$/, "")}/${e.name}`;
              if (e.type === "dir") walk(e.path, name);
              else if (!isBinary(ctx.fs, e)) targets.push({ name, path: e.path });
            }
          };
          walk(st.path, f);
        } else if (isBinary(ctx.fs, st)) {
          continue;
        } else targets.push({ name: f, path: st.path });
      }
      const showName = !o.h && (o.H || targets.length > 1 || recursive);
      const sep = c.cyan(":");
      for (const t of targets) {
        ctx.checkAbort();
        const text = t.text ?? (await ctx.fs.readText(t.path));
        let count = 0;
        const ls = lines(text);
        for (let i = 0; i < ls.length; i++) {
          const line = ls[i];
          re.lastIndex = 0;
          const hit = re.test(line);
          if (hit === !!o.v) continue;
          count++;
          any = true;
          if (o.q) return 0;
          if (o.c || o.l) continue;
          const prefix = [showName && [c.magenta(t.name), sep], o.n && [c.green(String(i + 1)), sep]];
          if (o.v) {
            ctx.print(prefix, line);
            continue;
          }
          re.lastIndex = 0;
          const segs = [];
          let last = 0;
          for (const m of line.matchAll(re)) {
            if (!m[0]) continue;
            if (o.o) {
              ctx.print(prefix, c.red(c.bold(m[0])));
              continue;
            }
            segs.push(line.slice(last, m.index), c.red(c.bold(m[0])));
            last = m.index + m[0].length;
          }
          if (!o.o) ctx.print(prefix, segs, line.slice(last));
        }
        if (o.c) ctx.print(showName ? [c.magenta(t.name), sep] : "", String(count));
        else if (o.l && count) ctx.print(c.magenta(t.name));
      }
      status = error && !o.q ? 2 : any ? 0 : 1;
      return status;
    },
  },
  wc: {
    group: "Text",
    desc: "print newline, word, and byte counts",
    usage: "wc [-clmw] [file ...]",
    async run(ctx) {
      const { o, rest } = getopts("wc", ctx.args, { flags: "clmwL", long: { lines: "l", words: "w", bytes: "c", chars: "m" } });
      const all = !o.l && !o.w && !o.c && !o.m;
      const { inputs, status } = await readInputs(ctx, "wc", rest);
      const rows = inputs.map((i) => ({
        name: i.name === "-" ? "" : i.name,
        l: (i.text.match(/\n/g) || []).length,
        w: (i.text.match(/\S+/g) || []).length,
        c: byteLen(i.text),
        m: [...i.text].length,
      }));
      if (rows.length > 1) rows.push(rows.reduce((t, r) => ({ name: "total", l: t.l + r.l, w: t.w + r.w, c: t.c + r.c, m: t.m + r.m }), { l: 0, w: 0, c: 0, m: 0 }));
      const keys = all ? ["l", "w", "c"] : ["l", "w", "m", "c"].filter((k) => o[k]);
      const width = rest.length || keys.length > 1 ? Math.max(1, ...rows.map((r) => Math.max(...keys.map((k) => String(r[k]).length)))) : 1;
      for (const r of rows) ctx.print(keys.map((k) => padL(r[k], width)).join(" "), r.name ? ` ${r.name}` : "");
      return status;
    },
  },
  sort: {
    group: "Text",
    desc: "sort lines of text files",
    usage: "sort [-fnru] [-k field] [file ...]",
    async run(ctx) {
      const { o, rest } = getopts("sort", ctx.args, { flags: "fnruhb", values: "kt", long: { reverse: "r", numeric: "n", unique: "u", "ignore-case": "f" } });
      const { inputs, status } = await readInputs(ctx, "sort", rest);
      let ls = inputs.flatMap((i) => lines(i.text));
      const field = o.k ? Number(String(o.k).split(",")[0]) : 0;
      const key = (l) => (field ? (o.t ? l.split(o.t) : l.trim().split(/\s+/))[field - 1] ?? "" : l);
      ls.sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        if (o.n || o.h) return (parseFloat(ka) || 0) - (parseFloat(kb) || 0) || a.localeCompare(b);
        return o.f ? ka.toLowerCase().localeCompare(kb.toLowerCase()) : ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      if (o.r) ls.reverse();
      if (o.u) ls = ls.filter((l, i) => i === 0 || (o.f ? l.toLowerCase() !== ls[i - 1].toLowerCase() : l !== ls[i - 1]));
      if (ls.length) ctx.out(ls.join("\n") + "\n");
      return status;
    },
  },
  uniq: {
    group: "Text",
    desc: "report or omit repeated lines",
    usage: "uniq [-cdiu] [file]",
    async run(ctx) {
      const { o, rest } = getopts("uniq", ctx.args, { flags: "cdiu", long: { count: "c", repeated: "d", unique: "u", "ignore-case": "i" } });
      const { inputs, status } = await readInputs(ctx, "uniq", rest.slice(0, 1));
      const ls = lines(inputs.map((i) => i.text).join(""));
      const groups = [];
      for (const l of ls) {
        const last = groups[groups.length - 1];
        if (last && (o.i ? last.l.toLowerCase() === l.toLowerCase() : last.l === l)) last.n++;
        else groups.push({ l, n: 1 });
      }
      for (const g of groups) {
        if (o.d && g.n < 2) continue;
        if (o.u && g.n > 1) continue;
        ctx.print(o.c ? `${padL(g.n, 7)} ` : "", g.l);
      }
      return status;
    },
  },
  rev: {
    group: "Text",
    desc: "reverse lines characterwise",
    usage: "rev [file ...]",
    async run(ctx) {
      const { inputs, status } = await readInputs(ctx, "rev", ctx.args);
      for (const l of lines(inputs.map((i) => i.text).join(""))) ctx.print([...l].reverse().join(""));
      return status;
    },
  },
  tac: {
    group: "Text",
    desc: "concatenate and print files in reverse",
    usage: "tac [file ...]",
    async run(ctx) {
      const { inputs, status } = await readInputs(ctx, "tac", ctx.args);
      const ls = lines(inputs.map((i) => i.text).join("")).reverse();
      if (ls.length) ctx.out(ls.join("\n") + "\n");
      return status;
    },
  },
  cut: {
    group: "Text",
    desc: "remove sections from each line of files",
    usage: "cut -d delim -f fields [file ...] | cut -c list",
    async run(ctx) {
      const { o, rest } = getopts("cut", ctx.args, { values: "dfc", long: { delimiter: "d", fields: "f", characters: "c" } });
      if (!o.f && !o.c) return ctx.err("cut: you must specify a list of bytes, characters, or fields\nTry 'cut --help' for more information."), 1;
      const parseList = (spec) => (idx, len) =>
        String(spec)
          .split(",")
          .some((r) => {
            const [a, b] = r.includes("-") ? r.split("-") : [r, r];
            const lo = a ? Number(a) : 1;
            const hi = b === "" ? len : Number(b);
            return idx >= lo && idx <= hi;
          });
      const { inputs, status } = await readInputs(ctx, "cut", rest);
      const sel = parseList(o.f ?? o.c);
      const d = o.d ?? "\t";
      for (const l of lines(inputs.map((i) => i.text).join(""))) {
        if (o.c) ctx.print([...l].filter((_, i) => sel(i + 1, l.length)).join(""));
        else {
          const parts = l.split(d);
          if (parts.length === 1) ctx.print(l);
          else ctx.print(parts.filter((_, i) => sel(i + 1, parts.length)).join(d));
        }
      }
      return status;
    },
  },
  tr: {
    group: "Text",
    desc: "translate or delete characters",
    usage: "tr [-d] set1 [set2]",
    run(ctx) {
      const { o, rest } = getopts("tr", ctx.args, { flags: "ds" });
      const expand = (s) =>
        s
          .replace(/\[:upper:\]/g, "A-Z")
          .replace(/\[:lower:\]/g, "a-z")
          .replace(/\[:digit:\]/g, "0-9")
          .replace(/\[:space:\]/g, " \t\n")
          .replace(/(.)-(.)/g, (_, a, b) => {
            let out = "";
            for (let i = a.charCodeAt(0); i <= b.charCodeAt(0); i++) out += String.fromCharCode(i);
            return out;
          })
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t");
      if (!rest.length || (!o.d && rest.length < 2)) return ctx.err("tr: missing operand\nTry 'tr --help' for more information."), 1;
      const a = [...expand(rest[0])];
      const b = [...expand(rest[1] ?? "")];
      let out = "";
      for (const ch of ctx.stdin ?? "") {
        const i = a.indexOf(ch);
        if (i === -1) out += ch;
        else if (!o.d) out += b[Math.min(i, b.length - 1)] ?? "";
      }
      if (o.s && b.length) out = out.replace(new RegExp(`([${b.join("").replace(/[\]\\^-]/g, "\\$&")}])\\1+`, "g"), "$1");
      ctx.out(out);
      return 0;
    },
  },
  tee: {
    group: "Text",
    desc: "read from standard input and write to standard output and files",
    usage: "tee [-a] [file ...]",
    async run(ctx) {
      const { o, rest } = getopts("tee", ctx.args, { flags: "a", long: { append: "a" } });
      const text = ctx.stdin ?? "";
      let status = 0;
      for (const f of rest) {
        const p = ctx.resolve(f);
        if (!ctx.fs.isDir(dirname(p)) || ctx.fs.isDir(p)) {
          ctx.err(`tee: ${f}: ${ctx.fs.isDir(p) ? "Is a directory" : "No such file or directory"}`);
          status = 1;
          continue;
        }
        const prev = o.a && ctx.fs.isFile(p) ? await ctx.fs.readText(p) : "";
        ctx.fs.writeText(p, prev + text);
      }
      ctx.out(text);
      return status;
    },
  },
  echo: {
    group: "Text",
    builtin: true,
    desc: "display a line of text",
    usage: "echo [-neE] [string ...]",
    run(ctx) {
      const args = [...ctx.args];
      let newline = true;
      let escapes = true; // zsh's echo interprets escapes by default
      while (args.length && /^-[neE]+$/.test(args[0])) {
        const f = args.shift();
        if (f.includes("n")) newline = false;
        if (f.includes("E")) escapes = false;
        if (f.includes("e")) escapes = true;
      }
      let text = args.join(" ");
      if (escapes) {
        const cut = text.indexOf("\\c");
        if (cut !== -1) {
          text = text.slice(0, cut);
          newline = false;
        }
        text = unescape(text);
      }
      ctx.out(text + (newline ? "\n" : ""));
      return 0;
    },
  },
  printf: {
    group: "Text",
    builtin: true,
    desc: "format and print data",
    usage: "printf format [arguments ...]",
    run(ctx) {
      if (!ctx.args.length) return ctx.err("printf: not enough arguments"), 1;
      const [fmt, ...args] = ctx.args;
      let out = "";
      let ai = 0;
      do {
        out += unescape(fmt).replace(/%(-?\d*)(?:\.(\d+))?([sdifxXoc%])/g, (m, width, prec, conv) => {
          if (conv === "%") return "%";
          const a = args[ai++] ?? "";
          let v;
          if (conv === "s") v = prec != null ? a.slice(0, Number(prec)) : a;
          else if (conv === "d" || conv === "i") v = String(Math.trunc(Number(a) || 0));
          else if (conv === "f") v = (Number(a) || 0).toFixed(prec != null ? Number(prec) : 6);
          else if (conv === "x") v = (Number(a) || 0).toString(16);
          else if (conv === "X") v = (Number(a) || 0).toString(16).toUpperCase();
          else if (conv === "o") v = (Number(a) || 0).toString(8);
          else v = a[0] ?? "";
          const w = Number(width) || 0;
          return width.startsWith("-") ? v.padEnd(-w) : v.padStart(w);
        });
      } while (ai > 0 && ai < args.length);
      ctx.out(out);
      return 0;
    },
  },
  seq: {
    group: "Text",
    desc: "print a sequence of numbers",
    usage: "seq [-w] [-s sep] [first [incr]] last",
    async run(ctx) {
      const args = [...ctx.args];
      let sep = "\n";
      let equal = false;
      while (args.length && /^-[sw]/.test(args[0]) && !/^-\d/.test(args[0])) {
        const a = args.shift();
        if (a === "-w") equal = true;
        else if (a.startsWith("-s")) sep = unescape(a.length > 2 ? a.slice(2) : args.shift() ?? "\n");
      }
      if (!args.length) return ctx.err("seq: missing operand\nTry 'seq --help' for more information."), 1;
      const nums = args.map(Number);
      const bad = args.find((a, i) => !Number.isFinite(nums[i]));
      if (bad != null) return ctx.err(`seq: invalid floating point argument: '${bad}'`), 1;
      const [first, incr, last] = nums.length === 1 ? [1, 1, nums[0]] : nums.length === 2 ? [nums[0], 1, nums[1]] : nums;
      if (incr === 0) return ctx.err("seq: invalid Zero increment value: '0'"), 1;
      const dec = Math.max(...args.map((a) => (a.split(".")[1] || "").length));
      const out = [];
      for (let v = first, n = 0; incr > 0 ? v <= last + 1e-9 : v >= last - 1e-9; v = first + incr * ++n) {
        out.push(v.toFixed(dec));
        if (out.length > 100000) break;
      }
      const w = equal ? Math.max(...out.map((s) => s.length)) : 0;
      if (out.length) ctx.out(out.map((s) => (w ? s.padStart(w, "0") : s)).join(sep) + "\n");
      return 0;
    },
  },
  base64: {
    group: "Text",
    desc: "base64 encode/decode data",
    usage: "base64 [-d] [-w cols] [file]",
    async run(ctx) {
      const { o, rest } = getopts("base64", ctx.args, { flags: "di", values: "w", long: { decode: "d", wrap: "w", "ignore-garbage": "i" } });
      let bytes;
      if (rest.length && rest[0] !== "-") {
        const st = ctx.fs.stat(ctx.resolve(rest[0]));
        if (!st) return ctx.err(`base64: ${rest[0]}: No such file or directory`), 1;
        if (st.type === "dir") return ctx.err(`base64: ${rest[0]}: Is a directory`), 1;
        bytes = await readBytes(ctx, st.path);
      } else bytes = new TextEncoder().encode(ctx.stdin ?? "");
      if (o.d) {
        const src = new TextDecoder().decode(bytes).replace(o.i ? /[^A-Za-z0-9+/=]/g : /\s+/g, "");
        try {
          const bin = atob(src);
          const out = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
          ctx.out(new TextDecoder().decode(out));
          return 0;
        } catch {
          ctx.err("base64: invalid input");
          return 1;
        }
      }
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const enc = btoa(bin);
      const w = o.w != null ? Number(o.w) : 76;
      ctx.out((w > 0 ? enc.match(new RegExp(`.{1,${w}}`, "g")) || [""] : [enc]).join("\n") + "\n");
      return 0;
    },
  },
  sha256sum: hashCmd("sha256sum", "SHA-256"),
  sha1sum: hashCmd("sha1sum", "SHA-1"),
  sha512sum: hashCmd("sha512sum", "SHA-512"),
  basename: {
    group: "Text",
    desc: "strip directory and suffix from filenames",
    usage: "basename name [suffix]",
    run(ctx) {
      if (!ctx.args.length) return ctx.err("basename: missing operand"), 1;
      let b = basename(ctx.args[0]);
      if (ctx.args[1] && b.endsWith(ctx.args[1]) && b !== ctx.args[1]) b = b.slice(0, -ctx.args[1].length);
      ctx.print(b);
      return 0;
    },
  },
  dirname: {
    group: "Text",
    desc: "strip last component from file name",
    usage: "dirname name ...",
    run(ctx) {
      if (!ctx.args.length) return ctx.err("dirname: missing operand"), 1;
      for (const a of ctx.args) ctx.print(a.includes("/") ? (a.startsWith("/") ? dirname(a) : dirname("/" + a).slice(1) || ".") : ".");
      return 0;
    },
  },
  realpath: {
    group: "Files",
    desc: "print the resolved absolute file name",
    usage: "realpath file ...",
    run(ctx) {
      let status = 0;
      for (const a of ctx.args.length ? ctx.args : ["."]) {
        const p = ctx.resolve(a);
        if (!ctx.fs.exists(p)) {
          ctx.err(`realpath: ${a}: No such file or directory`);
          status = 1;
        } else ctx.print(p);
      }
      return status;
    },
  },

  // ---- shell builtins -----------------------------------------------------
  export: {
    group: "Shell",
    builtin: true,
    desc: "set export attribute for shell variables",
    usage: "export [name[=value] ...]",
    run(ctx) {
      if (!ctx.args.length || ctx.args[0] === "-p") {
        for (const k of Object.keys(ctx.shell.env).sort()) ctx.print(`${k}=${quote(ctx.shell.env[k])}`);
        return 0;
      }
      for (const a of ctx.args) {
        const m = /^([A-Za-z_]\w*)(?:=(.*))?$/s.exec(a);
        if (!m) return ctx.err(`export: not an identifier: ${a.split("=")[0]}`), 1;
        if (m[2] != null) ctx.shell.env[m[1]] = m[2];
        else ctx.shell.env[m[1]] ??= "";
      }
      return 0;
    },
  },
  unset: {
    group: "Shell",
    builtin: true,
    desc: "unset values and attributes of variables",
    usage: "unset name ...",
    run(ctx) {
      for (const a of ctx.args) delete ctx.shell.env[a];
      return 0;
    },
  },
  env: {
    group: "Shell",
    desc: "print the environment",
    usage: "env",
    run(ctx) {
      for (const [k, v] of Object.entries(ctx.env)) ctx.print(`${k}=${v}`);
      return 0;
    },
  },
  printenv: {
    group: "Shell",
    desc: "print all or part of environment",
    usage: "printenv [variable ...]",
    run(ctx) {
      if (!ctx.args.length) {
        for (const [k, v] of Object.entries(ctx.env)) ctx.print(`${k}=${v}`);
        return 0;
      }
      let status = 0;
      for (const a of ctx.args) {
        if (a in ctx.env) ctx.print(ctx.env[a]);
        else status = 1;
      }
      return status;
    },
  },
  alias: {
    group: "Shell",
    builtin: true,
    desc: "define or display aliases",
    usage: "alias [name[=value] ...]",
    run(ctx) {
      const { aliases } = ctx.shell;
      if (!ctx.args.length) {
        for (const k of Object.keys(aliases).sort()) ctx.print(`${k}=${quote(aliases[k])}`);
        return 0;
      }
      let status = 0;
      for (const a of ctx.args) {
        const eq = a.indexOf("=");
        if (eq > 0) aliases[a.slice(0, eq)] = a.slice(eq + 1);
        else if (Object.hasOwn(aliases, a)) ctx.print(`${a}=${quote(aliases[a])}`);
        else status = 1;
      }
      return status;
    },
  },
  unalias: {
    group: "Shell",
    builtin: true,
    desc: "remove alias definitions",
    usage: "unalias [-a] name ...",
    run(ctx) {
      if (ctx.args[0] === "-a") {
        for (const k of Object.keys(ctx.shell.aliases)) delete ctx.shell.aliases[k];
        return 0;
      }
      let status = 0;
      for (const a of ctx.args) {
        if (Object.hasOwn(ctx.shell.aliases, a)) delete ctx.shell.aliases[a];
        else {
          ctx.err(`unalias: no such hash table element: ${a}`);
          status = 1;
        }
      }
      return status;
    },
  },
  which: {
    group: "Shell",
    builtin: true,
    desc: "locate a command",
    usage: "which name ...",
    run(ctx) {
      let status = 0;
      for (const n of ctx.args) {
        const def = Object.hasOwn(ctx.shell.commands, n) ? ctx.shell.commands[n] : null;
        if (Object.hasOwn(ctx.shell.aliases, n)) ctx.print(`${n}: aliased to ${ctx.shell.aliases[n]}`);
        else if (def?.builtin) ctx.print(`${n}: shell built-in command`);
        else if (def) ctx.print(`/usr/bin/${n}`);
        else {
          ctx.print(cmdNotFoundHint(n));
          status = 1;
        }
      }
      return status;
    },
  },
  type: {
    group: "Shell",
    builtin: true,
    desc: "describe a command",
    usage: "type name ...",
    run(ctx) {
      let status = 0;
      for (const n of ctx.args) {
        const def = Object.hasOwn(ctx.shell.commands, n) ? ctx.shell.commands[n] : null;
        if (Object.hasOwn(ctx.shell.aliases, n)) ctx.print(`${n} is an alias for ${ctx.shell.aliases[n]}`);
        else if (def?.builtin) ctx.print(`${n} is a shell builtin`);
        else if (def) ctx.print(`${n} is /usr/bin/${n}`);
        else {
          ctx.print(`${n} not found`);
          status = 1;
        }
      }
      return status;
    },
  },
  history: {
    group: "Shell",
    builtin: true,
    desc: "display the command history",
    usage: "history [-c] [n]",
    run(ctx) {
      const h = ctx.shell.history;
      if (ctx.args[0] === "-c") {
        h.length = 0;
        ctx.term?.saveHistory?.();
        return 0;
      }
      const n = ctx.args[0] ? Number(ctx.args[0]) : h.length;
      const start = Math.max(0, h.length - (Number.isFinite(n) ? Math.abs(n) : h.length));
      const w = String(h.length).length + 2;
      for (let i = start; i < h.length; i++) ctx.print(c.gray(padL(i + 1, w)), "  ", h[i]);
      return 0;
    },
  },
  true: { group: "Shell", builtin: true, desc: "do nothing, successfully", usage: "true", run: () => 0 },
  false: { group: "Shell", builtin: true, desc: "do nothing, unsuccessfully", usage: "false", run: () => 1 },
  sleep: {
    group: "Shell",
    desc: "delay for a specified amount of time",
    usage: "sleep number[smhd]",
    async run(ctx) {
      if (!ctx.args.length) return ctx.err("sleep: missing operand\nTry 'sleep --help' for more information."), 1;
      let ms = 0;
      for (const a of ctx.args) {
        const m = /^(\d*\.?\d+)([smhd]?)$/.exec(a);
        if (!m) return ctx.err(`sleep: invalid time interval '${a}'`), 1;
        ms += Number(m[1]) * { "": 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]] * 1000;
      }
      await ctx.sleep(ms);
      return 0;
    },
  },
  yes: {
    group: "Shell",
    desc: "output a string repeatedly until killed",
    usage: "yes [string]",
    async run(ctx) {
      const s = (ctx.args.length ? ctx.args.join(" ") : "y") + "\n";
      if (!ctx.tty) {
        ctx.out(s.repeat(1000));
        return 0;
      }
      for (;;) {
        ctx.out(s.repeat(40));
        await ctx.sleep(30);
      }
    },
  },

  // ---- system info --------------------------------------------------------
  date: {
    group: "System",
    desc: "print the system date and time",
    usage: "date [-uRI] [+format]",
    run(ctx) {
      const { o, rest } = getopts("date", ctx.args.filter((a) => !a.startsWith("+")), { flags: "uRI", long: { utc: "u", "rfc-email": "R", "iso-8601": "I" } });
      if (rest.length) return ctx.err(`date: invalid date '${rest[0]}'`), 1;
      const fmt = ctx.args.find((a) => a.startsWith("+"));
      const d = new Date();
      if (fmt) ctx.print(strftime(fmt.slice(1), d, o.u));
      else if (o.R) ctx.print(strftime("%a, %d %b %Y %T %z", d, o.u));
      else if (o.I) ctx.print(strftime("%F", d, o.u));
      else ctx.print(defaultDate(d, o.u));
      return 0;
    },
  },
  cal: {
    group: "System",
    desc: "display a calendar",
    usage: "cal [[month] year]",
    run(ctx) {
      const now = new Date();
      let month = now.getMonth();
      let year = now.getFullYear();
      let whole = false;
      const nums = ctx.args.filter((a) => !a.startsWith("-")).map(Number);
      if (nums.some((n) => !Number.isInteger(n))) return ctx.err(`cal: invalid argument`), 1;
      if (nums.length === 1) {
        year = nums[0];
        whole = true;
      } else if (nums.length >= 2) {
        month = nums[0] - 1;
        year = nums[1];
        if (month < 0 || month > 11) return ctx.err(`cal: ${nums[0]} is neither a month number (1..12) nor a name`), 1;
      }
      if (ctx.args.includes("-y")) whole = true;
      const monthLines = (m) => {
        const title = whole ? MONTHS_LONG[m] : `${MONTHS_LONG[m]} ${year}`;
        const out = [[" ".repeat(Math.floor((20 - title.length) / 2)) + title.padEnd(20 - Math.floor((20 - title.length) / 2))], ["Su Mo Tu We Th Fr Sa"]];
        const first = new Date(year, m, 1).getDay();
        const days = new Date(year, m + 1, 0).getDate();
        let row = [" ".repeat(first * 3)];
        for (let d = 1; d <= days; d++) {
          const today = d === now.getDate() && m === now.getMonth() && year === now.getFullYear();
          const cell = padL(d, 2);
          row.push(today && ctx.tty ? c.inverse(cell) : cell);
          if ((first + d) % 7 === 0 || d === days) {
            const used = (d === days ? (first + d) % 7 || 7 : 7) * 3 - 1;
            if (d === days && used < 20) row.push(" ".repeat(20 - used));
            out.push(row);
            row = [];
          } else row.push(" ");
        }
        while (out.length < 8) out.push([" ".repeat(20)]);
        return out;
      };
      if (!whole) {
        for (const l of monthLines(month)) ctx.print(l);
        return 0;
      }
      const t = String(year);
      ctx.print(" ".repeat(Math.floor((64 - t.length) / 2)), t);
      ctx.print("");
      for (let q = 0; q < 12; q += 3) {
        const blocks3 = [0, 1, 2].map((i) => monthLines(q + i));
        for (let r = 0; r < 8; r++) ctx.print(blocks3[0][r], "  ", blocks3[1][r], "  ", blocks3[2][r]);
      }
      return 0;
    },
  },
  uptime: {
    group: "System",
    desc: "tell how long the system has been running",
    usage: "uptime [-p]",
    run(ctx) {
      const ms = Date.now() - (ctx.shell.bootTime ?? ctx.shell.startedAt);
      if (ctx.args.includes("-p")) {
        const m = Math.floor(ms / 60000);
        const parts = [];
        if (m >= 1440) parts.push(`${Math.floor(m / 1440)} day${m >= 2880 ? "s" : ""}`);
        if (m % 1440 >= 60) parts.push(`${Math.floor((m % 1440) / 60)} hour${Math.floor((m % 1440) / 60) > 1 ? "s" : ""}`);
        parts.push(`${m % 60} minute${m % 60 === 1 ? "" : "s"}`);
        ctx.print(`up ${parts.join(", ")}`);
        return 0;
      }
      const t = strftime("%T");
      const l = (k) => ((hash(String(Math.floor(Date.now() / 60000) + k)) % 60) / 100 + 0.08).toFixed(2);
      ctx.print(` ${t} up ${uptimeText(ms)},  1 user,  load average: ${l(1)}, ${l(5)}, ${l(15)}`);
      return 0;
    },
  },
  whoami: {
    group: "System",
    desc: "print effective user name (--verbose: who is behind it)",
    usage: "whoami [--verbose]",
    run(ctx) {
      if ((ctx.args.includes("--verbose") || ctx.args.includes("-v")) && ctx.shell.commands.about) {
        return ctx.shell.commands.about.run(ctx);
      }
      ctx.print(ctx.shell.user);
      return 0;
    },
  },
  id: {
    group: "System",
    desc: "print real and effective user and group IDs",
    usage: "id [-unG]",
    run(ctx) {
      const u = ctx.shell.user;
      if (ctx.args.includes("-u")) return ctx.print(ctx.args.includes("-n") ? u : "1000"), 0;
      if (ctx.args.includes("-G")) return ctx.print("1000 4 20 24 25 29 30 44 46 100 106 111 117 118"), 0;
      ctx.print(
        `uid=1000(${u}) gid=1000(${u}) groups=1000(${u}),4(adm),20(dialout),24(cdrom),25(floppy),29(audio),30(dip),44(video),46(plugdev),100(users),106(netdev),111(bluetooth),117(wireshark),118(kaboxer)`
      );
      return 0;
    },
  },
  hostname: {
    group: "System",
    desc: "show the system's host name",
    usage: "hostname",
    run(ctx) {
      ctx.print(ctx.shell.host);
      return 0;
    },
  },
  uname: {
    group: "System",
    desc: "print system information",
    usage: "uname [-asnrvmo]",
    run(ctx) {
      const { o } = getopts("uname", ctx.args, { flags: "asnrvmpio", long: { all: "a", "kernel-name": "s", "nodename": "n", "kernel-release": "r", "kernel-version": "v", machine: "m", "operating-system": "o" } });
      const info = {
        s: "Linux",
        n: ctx.shell.host,
        r: "6.12.0-sherlockos-amd64",
        v: "#1 SMP PREEMPT_DYNAMIC SherlockOS 6.12.0-1 (2026-11-01)",
        m: "x86_64",
        o: "GNU/Linux",
      };
      const keys = o.a ? ["s", "n", "r", "v", "m", "o"] : ["s", "n", "r", "v", "m", "o"].filter((k) => o[k]);
      ctx.print((keys.length ? keys : ["s"]).map((k) => info[k]).join(" "));
      return 0;
    },
  },
};

function unescape(s) {
  return s.replace(/\\(0[0-7]{0,3}|x[0-9a-fA-F]{1,2}|[abefnrtv\\])/g, (m, e) => {
    if (e[0] === "0") return String.fromCharCode(parseInt(e.slice(1) || "0", 8));
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    return { a: "\x07", b: "\b", e: "\x1b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\" }[e];
  });
}

function hashCmd(name, algo) {
  return {
    group: "Text",
    desc: `compute and check ${algo} message digest`,
    usage: `${name} [file ...]`,
    async run(ctx) {
      if (!globalThis.crypto?.subtle) return ctx.err(`${name}: Web Crypto is unavailable in this context`), 1;
      const files = ctx.args.length ? ctx.args : ["-"];
      let status = 0;
      for (const f of files) {
        let bytes;
        if (f === "-") bytes = new TextEncoder().encode(ctx.stdin ?? "");
        else {
          const st = ctx.fs.stat(ctx.resolve(f));
          if (!st) {
            ctx.err(`${name}: ${f}: No such file or directory`);
            status = 1;
            continue;
          }
          if (st.type === "dir") {
            ctx.err(`${name}: ${f}: Is a directory`);
            status = 1;
            continue;
          }
          bytes = await readBytes(ctx, st.path);
        }
        const digest = new Uint8Array(await crypto.subtle.digest(algo, bytes));
        ctx.print([...digest].map((b) => b.toString(16).padStart(2, "0")).join(""), "  ", f);
      }
      return status;
    },
  };
}

export { wrap, table };
