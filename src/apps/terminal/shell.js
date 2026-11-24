// zsh-flavoured shell engine. Pure JS: no React, no DOM, no Vite features.
// The filesystem is injected (see src/os/fs.js for the interface), so this file runs under node.

// ---------------------------------------------------------------------------
// Styled output: a tiny span model. A segment is { t: text, s?: "red bold", color?, bg?, href? }.
// Helpers accept strings, segments or nested arrays and always return a flat array of segments.
// ---------------------------------------------------------------------------
export function flat(parts, out = []) {
  if (parts == null || parts === false) return out;
  if (Array.isArray(parts)) {
    for (const p of parts) flat(p, out);
  } else if (typeof parts === "object") {
    if (parts.t !== "") out.push(parts);
  } else {
    const t = String(parts);
    if (t !== "") out.push({ t });
  }
  return out;
}

const styler = (style) => (...parts) =>
  flat(parts).map((seg) => ({ ...seg, s: seg.s ? `${style} ${seg.s}` : style }));

const STYLE_NAMES = [
  "red", "green", "yellow", "blue", "magenta", "cyan", "white", "gray", "black",
  "bold", "dim", "italic", "underline", "inverse", "accent",
];

/** c.red("x"), c.bold(c.accent("x"), " y"), c.hex("#fff")("x"), c.link("text", "https://…") */
export const c = Object.fromEntries(STYLE_NAMES.map((n) => [n, styler(n)]));
c.hex = (color) => (...parts) => flat(parts).map((seg) => ({ ...seg, color }));
c.bg = (bg) => (...parts) => flat(parts).map((seg) => ({ ...seg, bg }));
c.link = (text, href) => flat(text).map((seg) => ({ ...seg, href, s: seg.s ? `link ${seg.s}` : "link" }));

/** Segments -> plain text. */
export const plain = (parts) => flat(parts).map((s) => s.t).join("");

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
export function normalize(p) {
  const out = [];
  for (const part of String(p).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}
export const dirname = (p) => {
  const n = normalize(p);
  const i = n.lastIndexOf("/");
  return i <= 0 ? "/" : n.slice(0, i);
};
export const basename = (p) => {
  const n = normalize(p);
  return n === "/" ? "/" : n.slice(n.lastIndexOf("/") + 1);
};
export function resolvePath(cwd, p, home) {
  if (!p) return normalize(cwd);
  if (p === "~" || p.startsWith("~/")) return normalize(home + p.slice(1));
  return p.startsWith("/") ? normalize(p) : normalize(`${cwd}/${p}`);
}
export const tildify = (p, home) =>
  p === home ? "~" : p.startsWith(home + "/") ? "~" + p.slice(home.length) : p;

// ---------------------------------------------------------------------------
// Misc helpers shared with commands
// ---------------------------------------------------------------------------
export class ShellError extends Error {}

export function abortError() {
  const e = new Error("interrupted");
  e.name = "AbortError";
  return e;
}

/** Abortable delay. */
export function sleep(ms, signal) {
  return new Promise((res, rej) => {
    if (signal?.aborted) return rej(abortError());
    const onAbort = () => {
      clearTimeout(t);
      rej(abortError());
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      res();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Lay out cells in ls-style columns (column-major).
 * cells: [{ text, seg? }] where seg is the styled version. Returns an array of lines (segments).
 */
export function columnize(cells, width, gap = 2) {
  if (!cells.length) return [];
  const n = cells.length;
  const lens = cells.map((x) => x.text.length);
  let best = { cols: 1, rows: n, widths: [Math.max(...lens)] };
  const maxCols = Math.min(n, Math.max(1, Math.floor(width / 3)));
  for (let cols = maxCols; cols > 1; cols--) {
    const rows = Math.ceil(n / cols);
    const used = Math.ceil(n / rows);
    const widths = [];
    for (let col = 0; col < used; col++) {
      let w = 0;
      for (let r = 0; r < rows && col * rows + r < n; r++) w = Math.max(w, lens[col * rows + r]);
      widths.push(w);
    }
    if (widths.reduce((a, b) => a + b, 0) + gap * (used - 1) <= width) {
      best = { cols: used, rows, widths };
      break;
    }
  }
  const lines = [];
  for (let r = 0; r < best.rows; r++) {
    const line = [];
    for (let col = 0; col < best.cols; col++) {
      const i = col * best.rows + r;
      if (i >= n) break;
      line.push(cells[i].seg ?? cells[i].text);
      const isLast = col === best.cols - 1 || (col + 1) * best.rows + r >= n;
      if (!isLast) line.push(" ".repeat(best.widths[col] - lens[i] + gap));
    }
    lines.push(flat(line));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Tokenizer
// A word is a list of parts: { text, q } | { v: varName, q } | { sub: command, q } | { arith, q }
// q: 0 unquoted, 1 literal (single quotes / backslash), 2 double quoted.
// ---------------------------------------------------------------------------
const OPS = ["2>&1", "&>", "2>>", "2>", "&&", "||", ">>", ";", "|", ">", "<", "&"];
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

export function tokenize(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let parts = null;

  const push = (part) => {
    parts ??= [];
    const last = parts[parts.length - 1];
    if (last && "text" in part && "text" in last && last.q === part.q) last.text += part.text;
    else parts.push(part);
  };
  const end = () => {
    if (parts) tokens.push({ type: "word", parts });
    parts = null;
  };
  const dollar = (q) => {
    // src[i] === "$"
    if (src.startsWith("$((", i)) {
      const close = src.indexOf("))", i + 3);
      if (close !== -1) {
        push({ arith: src.slice(i + 3, close), q });
        i = close + 2;
        return;
      }
    }
    if (src[i + 1] === "(") {
      let depth = 1;
      let j = i + 2;
      for (; j < n && depth; j++) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")") depth--;
      }
      if (depth) throw new ShellError("zsh: parse error: unmatched $(");
      push({ sub: src.slice(i + 2, j - 1), q });
      i = j;
      return;
    }
    if (src[i + 1] === "{") {
      const close = src.indexOf("}", i + 2);
      if (close === -1) throw new ShellError("zsh: bad substitution");
      push({ v: src.slice(i + 2, close), q });
      i = close + 1;
      return;
    }
    const rest = src.slice(i + 1);
    const m = NAME_RE.exec(rest) || /^[?$#!0-9]/.exec(rest);
    if (m) {
      push({ v: m[0], q });
      i += 1 + m[0].length;
      return;
    }
    push({ text: "$", q: q || 1 });
    i++;
  };

  while (i < n) {
    const ch = src[i];
    if (ch === " " || ch === "\t") {
      end();
      i++;
    } else if (ch === "\n") {
      end();
      tokens.push({ type: "op", v: ";" });
      i++;
    } else if (ch === "#" && !parts) {
      break;
    } else if (ch === "\\") {
      if (i + 1 < n) push({ text: src[i + 1], q: 1 });
      else push({ text: "\\", q: 1 });
      i += 2;
    } else if (ch === "'") {
      const close = src.indexOf("'", i + 1);
      if (close === -1) throw new ShellError("zsh: unmatched '");
      push({ text: src.slice(i + 1, close), q: 1 });
      i = close + 1;
    } else if (ch === '"') {
      i++;
      push({ text: "", q: 2 });
      let closed = false;
      while (i < n) {
        const d = src[i];
        if (d === '"') {
          closed = true;
          i++;
          break;
        }
        if (d === "\\" && i + 1 < n && '"\\$`'.includes(src[i + 1])) {
          push({ text: src[i + 1], q: 2 });
          i += 2;
        } else if (d === "$") {
          dollar(2);
        } else {
          push({ text: d, q: 2 });
          i++;
        }
      }
      if (!closed) throw new ShellError('zsh: unmatched "');
    } else if (ch === "$") {
      dollar(0);
    } else {
      let op = null;
      for (const o of OPS) {
        if (src.startsWith(o, i) && (!/^[2]/.test(o) || !parts)) {
          op = o;
          break;
        }
      }
      if (op) {
        end();
        tokens.push({ type: "op", v: op });
        i += op.length;
      } else {
        push({ text: ch, q: 0 });
        i++;
      }
    }
  }
  end();
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser: tokens -> [{ op: ";"|"&&"|"||", pipeline: [{ words, redirs }] }]
// ---------------------------------------------------------------------------
const REDIR_OPS = new Set([">", ">>", "<", "2>", "2>>", "&>"]);

export function parse(tokens) {
  const list = [];
  let pipeline = [];
  let cmd = { words: [], redirs: [] };
  let connector = ";";
  const nearErr = (v) => new ShellError(`zsh: parse error near \`${v}'`);
  const isEmpty = (x) => !x.words.length && !x.redirs.length;

  const endPipeline = (nextOp, strict) => {
    if (isEmpty(cmd)) {
      if (pipeline.length || strict) throw nearErr(nextOp);
    } else pipeline.push(cmd);
    if (pipeline.length) list.push({ op: connector, pipeline });
    pipeline = [];
    cmd = { words: [], redirs: [] };
    connector = nextOp;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "word") {
      cmd.words.push(t.parts);
    } else if (t.v === "|") {
      if (isEmpty(cmd)) throw nearErr("|");
      pipeline.push(cmd);
      cmd = { words: [], redirs: [] };
      if (i === tokens.length - 1) throw nearErr("|");
    } else if (t.v === ";" || t.v === "&") {
      endPipeline(";", false);
    } else if (t.v === "&&" || t.v === "||") {
      endPipeline(t.v, true);
      if (i === tokens.length - 1) throw nearErr(t.v);
    } else if (t.v === "2>&1") {
      cmd.redirs.push({ op: "2>&1" });
    } else if (REDIR_OPS.has(t.v)) {
      const target = tokens[i + 1];
      if (!target || target.type !== "word") throw nearErr(target ? target.v : "\\n");
      cmd.redirs.push({ op: t.v, target: target.parts });
      i++;
    }
  }
  endPipeline(";", false);
  return list;
}

// ---------------------------------------------------------------------------
// Arithmetic: $(( 1 + 2 * (3 - x) ))
// ---------------------------------------------------------------------------
function arithmetic(expr, env) {
  const toks = expr.match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|\*\*|[-+*/%()]/g) || [];
  if (toks.join("") !== expr.replace(/\s+/g, "").replace(/\$/g, "")) throw new ShellError("zsh: bad math expression");
  let i = 0;
  const atom = () => {
    const t = toks[i++];
    if (t === "(") {
      const v = sum();
      if (toks[i++] !== ")") throw new ShellError("zsh: bad math expression: ')' expected");
      return v;
    }
    if (t === "-") return -atom();
    if (t === "+") return atom();
    if (t == null) throw new ShellError("zsh: bad math expression: operand expected at end of string");
    if (/^\d/.test(t)) return Number(t);
    if (/^[A-Za-z_]/.test(t)) return Number(env[t]) || 0;
    throw new ShellError(`zsh: bad math expression: operand expected at \`${t}'`);
  };
  const power = () => {
    const base = atom();
    if (toks[i] === "**") {
      i++;
      return base ** power();
    }
    return base;
  };
  const product = () => {
    let v = power();
    while (["*", "/", "%"].includes(toks[i])) {
      const op = toks[i++];
      const r = power();
      if (op !== "*" && r === 0) throw new ShellError("zsh: division by zero");
      v = op === "*" ? v * r : op === "/" ? Math.trunc(v / r) : v % r;
    }
    return v;
  };
  function sum() {
    let v = product();
    while (toks[i] === "+" || toks[i] === "-") v = toks[i++] === "+" ? v + product() : v - product();
    return v;
  }
  const v = sum();
  if (i < toks.length) throw new ShellError("zsh: bad math expression");
  return v;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const DEFAULT_ALIASES = {
  ll: "ls -la",
  la: "ls -A",
  l: "ls -CF",
  cls: "clear",
  less: "cat",
  more: "cat",
  cmatrix: "matrix",
  top: "htop",
  "..": "cd ..",
};

/**
 * createShell({ fs, commands, home, cwd, history, user, host })
 * commands: { name: { run(ctx) -> exit code, desc, usage, group, builtin? } }
 */
export function createShell({ fs, commands, home = "/home/sherlock", cwd, history = [], user = "sherlock", host = "sherlockos" }) {
  const startDir = cwd && fs.isDir(cwd) ? normalize(cwd) : home;
  const shell = {
    fs,
    commands,
    home,
    user,
    host,
    cwd: startDir,
    status: 0,
    history,
    aliases: { ...DEFAULT_ALIASES },
    env: {
      USER: user,
      LOGNAME: user,
      HOME: home,
      HOSTNAME: host,
      SHELL: "/bin/zsh",
      PWD: startDir,
      OLDPWD: startDir,
      PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
      EDITOR: "vim",
    },
    startedAt: Date.now(),

    resolve: (p) => resolvePath(shell.cwd, p, home),
    tilde: (p) => tildify(p, home),

    setCwd(dir) {
      const next = normalize(dir);
      shell.env.OLDPWD = shell.cwd;
      shell.cwd = next;
      shell.env.PWD = next;
    },

    getVar(name, io) {
      switch (name) {
        case "?": return String(shell.status);
        case "$": return "1337";
        case "#": case "0": return name === "0" ? "zsh" : "0";
        case "!": return "";
        case "RANDOM": return String(Math.floor(Math.random() * 32768));
        case "COLUMNS": return String(io?.term?.cols ?? 80);
        case "LINES": return String(io?.term?.rows ?? 24);
        case "SECONDS": return String(Math.floor((Date.now() - shell.startedAt) / 1000));
        default: return shell.env[name] ?? "";
      }
    },

    // -- expansion ----------------------------------------------------------
    /** Expand one word -> array of strings (several when a glob matches). */
    async expandWord(parts, io) {
      const chars = []; // { ch, w } — w: unquoted (glob-active) literal
      let hasWild = false;
      for (let idx = 0; idx < parts.length; idx++) {
        const part = parts[idx];
        let text;
        let literal = false;
        if ("text" in part) {
          text = part.text;
          literal = part.q === 0;
          if (idx === 0 && literal && (text === "~" || text.startsWith("~/")) && (parts.length === 1 || text.length > 1)) {
            for (const ch of home) chars.push({ ch, w: false });
            text = text.slice(1);
          }
        } else if ("v" in part) {
          text = shell.getVar(part.v, io);
        } else if ("arith" in part) {
          text = String(arithmetic(part.arith, shell.env));
        } else {
          text = (await shell.capture(part.sub, io)).replace(/\n+$/, "");
          if (part.q === 0) text = text.replace(/\n/g, " ");
        }
        for (const ch of text) {
          const w = literal && (ch === "*" || ch === "?");
          if (w) hasWild = true;
          chars.push({ ch, w });
        }
      }
      const raw = chars.map((x) => x.ch).join("");
      if (!hasWild) return [raw];
      const matches = shell.glob(chars);
      if (!matches.length) throw new ShellError(`zsh: no matches found: ${raw}`);
      return matches;
    },

    glob(chars) {
      const segments = [[]];
      for (const x of chars) {
        if (x.ch === "/") segments.push([]);
        else segments[segments.length - 1].push(x);
      }
      const absolute = chars[0]?.ch === "/";
      let bases = [absolute ? "/" : ""];
      const joinTo = (base, name) => (base === "" ? name : base === "/" ? "/" + name : `${base}/${name}`);
      for (const seg of segments) {
        if (!seg.length) continue;
        const next = [];
        const lit = seg.map((x) => x.ch).join("");
        if (!seg.some((x) => x.w)) {
          for (const base of bases) next.push(joinTo(base, lit));
        } else {
          const re = new RegExp(
            "^" + seg.map((x) => (x.w ? (x.ch === "*" ? ".*" : ".") : escapeRe(x.ch))).join("") + "$"
          );
          const dotOk = seg[0].ch === "." && !seg[0].w;
          for (const base of bases) {
            const dir = shell.resolve(base || ".");
            if (!fs.isDir(dir)) continue;
            for (const entry of fs.list(dir, { hidden: true })) {
              if (entry.name.startsWith(".") && !dotOk) continue;
              if (re.test(entry.name)) next.push(joinTo(base, entry.name));
            }
          }
        }
        bases = next;
      }
      return bases.filter((p) => fs.exists(shell.resolve(p))).sort((a, b) => a.localeCompare(b));
    },

    // -- execution ----------------------------------------------------------
    /**
     * Run a command line. io: { write(segments), term, signal }.
     * Returns the exit status (also stored in shell.status / $?).
     */
    async exec(line, io) {
      let src = line;
      if (/(^|[^\\])!!/.test(src)) {
        const prev = shell.history[shell.history.length - 1];
        if (!prev) {
          io.write(flat("zsh: no such event: 1\n"));
          return (shell.status = 1);
        }
        src = src.replace(/(^|[^\\])!!/g, (_, pre) => pre + prev);
        io.write(flat(src + "\n"));
      }
      // HIST_IGNORE_DUPS + HIST_IGNORE_SPACE
      const entry = src.trim();
      if (entry && !/^\s/.test(src) && shell.history[shell.history.length - 1] !== entry) {
        shell.history.push(entry);
        if (shell.history.length > 1000) shell.history.splice(0, shell.history.length - 1000);
      }
      return shell.run(src, io);
    },

    /** Run without touching history (used by exec, $(…) and aliases). */
    async run(src, io) {
      let list;
      try {
        list = parse(tokenize(src));
      } catch (e) {
        io.write(flat(e.message + "\n"));
        return (shell.status = 1);
      }
      for (const { op, pipeline } of list) {
        if (io.signal?.aborted) return (shell.status = 130);
        if (op === "&&" && shell.status !== 0) continue;
        if (op === "||" && shell.status === 0) continue;
        shell.status = await shell.runPipeline(pipeline, io);
      }
      return shell.status;
    },

    /** Run a command line and return its stdout as text. */
    async capture(src, io) {
      const chunks = [];
      const saved = shell.status;
      await shell.run(src, { ...io, write: (segs) => chunks.push(plain(segs)), tty: false, errWrite: io.errWrite || io.write });
      const status = shell.status;
      shell.status = saved;
      shell.subStatus = status;
      return chunks.join("");
    },

    async runPipeline(cmds, io) {
      let stdin = null;
      let status = 0;
      for (let i = 0; i < cmds.length; i++) {
        if (io.signal?.aborted) return 130;
        const last = i === cmds.length - 1;
        const buf = [];
        status = await shell.runCommand(cmds[i], stdin, last ? null : buf, io);
        stdin = last ? null : buf.join("");
      }
      return status;
    },

    async runCommand(cmd, stdin, pipeBuf, io) {
      const stderr = io.errWrite || io.write;
      const fail = (msg, code = 1) => {
        stderr(flat(msg + "\n"));
        return code;
      };

      // alias expansion on the first word
      let words = cmd.words;
      const seen = new Set();
      while (words.length) {
        const first = words[0];
        const name = first.length === 1 && first[0].q === 0 && "text" in first[0] ? first[0].text : null;
        if (!name || seen.has(name) || !Object.hasOwn(shell.aliases, name)) break;
        seen.add(name);
        let aliasTokens;
        try {
          aliasTokens = tokenize(shell.aliases[name]);
        } catch (e) {
          return fail(e.message);
        }
        if (aliasTokens.some((t) => t.type !== "word")) {
          // complex alias (pipes, separators): run it as its own line with the remaining args appended
          const rest = [];
          for (const w of words.slice(1)) for (const s of await shell.expandWord(w, io)) rest.push(quote(s));
          const sub = { ...io };
          if (pipeBuf) {
            sub.write = (segs) => pipeBuf.push(plain(segs));
            sub.tty = false;
          }
          return shell.run(`${shell.aliases[name]} ${rest.join(" ")}`, sub);
        }
        words = [...aliasTokens.map((t) => t.parts), ...words.slice(1)];
      }

      // expansion
      let argv = [];
      const redirs = [];
      try {
        for (const w of words) argv.push(...(await shell.expandWord(w, io)));
        for (const r of cmd.redirs) {
          redirs.push({ op: r.op, target: r.target ? (await shell.expandWord(r.target, io))[0] : null });
        }
      } catch (e) {
        if (e instanceof ShellError) return fail(e.message);
        throw e;
      }

      // leading VAR=value assignments
      const assigns = {};
      let nAssign = 0;
      while (nAssign < words.length) {
        const p0 = words[nAssign][0];
        const m = "text" in p0 && p0.q === 0 && /^([A-Za-z_]\w*)=/.exec(p0.text);
        if (!m) break;
        assigns[m[1]] = argv[nAssign].slice(m[1].length + 1);
        nAssign++;
      }
      // (globs can change argv length, but assignment words never glob in practice)
      argv = argv.slice(nAssign);
      if (!argv.length) {
        Object.assign(shell.env, assigns);
        if (!redirs.length) return nAssign ? 0 : shell.status;
      }

      // redirections
      let outFile = null;
      let errFile = null;
      let mergeErr = false;
      for (const r of redirs) {
        if (r.op === "2>&1") {
          mergeErr = true;
          continue;
        }
        const path = shell.resolve(r.target);
        if (r.op === "<") {
          if (!fs.exists(path)) return fail(`zsh: no such file or directory: ${r.target}`);
          if (fs.isDir(path)) return fail(`zsh: is a directory: ${r.target}`);
          stdin = await fs.readText(path);
          continue;
        }
        const devNull = path === "/dev/null";
        if (!devNull) {
          if (fs.isDir(path)) return fail(`zsh: is a directory: ${r.target}`);
          if (!fs.isDir(dirname(path))) return fail(`zsh: no such file or directory: ${r.target}`);
        }
        const file = { path, append: r.op.endsWith(">>"), devNull, chunks: [] };
        if (r.op === "&>") outFile = errFile = file;
        else if (r.op.startsWith("2")) errFile = file;
        else outFile = file;
      }

      const outSink = outFile
        ? (segs) => outFile.chunks.push(plain(segs))
        : pipeBuf
        ? (segs) => pipeBuf.push(plain(segs))
        : io.write;
      const errSink = errFile ? (segs) => errFile.chunks.push(plain(segs)) : mergeErr ? outSink : stderr;
      const tty = !outFile && !pipeBuf && io.tty !== false;

      let status = 0;
      if (argv.length) {
        const name = argv[0];
        const def = Object.hasOwn(commands, name) ? commands[name] : null;
        if (!def) {
          const p = name.includes("/") ? shell.resolve(name) : null;
          if (p && fs.isDir(p)) {
            shell.setCwd(p); // zsh AUTO_CD
            status = 0;
          } else if (p && fs.exists(p)) {
            errSink(flat(`zsh: permission denied: ${name}\n`));
            status = 126;
          } else if (p) {
            errSink(flat(`zsh: no such file or directory: ${name}\n`));
            status = 127;
          } else {
            errSink(flat(`zsh: command not found: ${name}\n`));
            status = 127;
          }
        } else {
          const ctx = {
            name,
            args: argv.slice(1),
            stdin,
            cwd: shell.cwd,
            env: nAssign ? { ...shell.env, ...assigns } : shell.env,
            term: io.term,
            signal: io.signal,
            tty,
            cols: io.term?.cols ?? 80,
            shell,
            fs,
            io,
            out: (...parts) => outSink(flat(parts)),
            print: (...parts) => outSink(flat([parts, "\n"])),
            err: (...parts) => errSink(flat([parts, "\n"])),
            resolve: shell.resolve,
            sleep: (ms) => sleep(ms, io.signal),
            checkAbort() {
              if (io.signal?.aborted) throw abortError();
            },
          };
          try {
            status = (await def.run(ctx)) ?? 0;
          } catch (e) {
            if (e?.name === "AbortError") status = 130;
            else if (e instanceof ShellError) {
              errSink(flat(e.message + "\n"));
              status = e.code ?? 1;
            } else {
              errSink(flat(`${name}: ${e?.message || e}\n`));
              status = 1;
            }
          }
        }
      }

      for (const file of new Set([outFile, errFile])) {
        if (!file || file.devNull) continue;
        const text = file.chunks.join("");
        const prev = file.append && fs.isFile(file.path) ? await fs.readText(file.path) : "";
        fs.writeText(file.path, prev + text);
      }
      return status;
    },

    // -- completion -----------------------------------------------------------
    /**
     * Completion for the text left of the cursor.
     * Returns { start, quote, word, items: [{ text, label, dir }] } where `text` is the full
     * (unescaped) replacement for the word that starts at index `start`.
     */
    complete(line, cursor = line.length, extra = {}) {
      const left = line.slice(0, cursor);
      let start = 0;
      let word = "";
      let inWord = false;
      let quoteCh = null;
      let cmdPos = true;
      let firstWord = null;
      let wordIndex = 0;
      const prevWords = [];
      const endWord = () => {
        if (!inWord) return;
        if (cmdPos) {
          firstWord = word;
          cmdPos = false;
        }
        prevWords.push(word);
        wordIndex++;
        inWord = false;
        word = "";
      };
      for (let i = 0; i < left.length; i++) {
        const ch = left[i];
        if (quoteCh) {
          if (ch === quoteCh) quoteCh = null;
          else if (ch === "\\" && quoteCh === '"' && i + 1 < left.length) word += left[++i];
          else word += ch;
          continue;
        }
        if (ch === " " || ch === "\t") {
          endWord();
        } else if (ch === ";" || ch === "|" || ch === "&") {
          endWord();
          cmdPos = true;
          firstWord = null;
          wordIndex = 0;
          prevWords.length = 0;
        } else {
          if (!inWord) {
            inWord = true;
            start = i;
            word = "";
          }
          if (ch === "'" || ch === '"') quoteCh = ch;
          else if (ch === "\\" && i + 1 < left.length) word += left[++i];
          else word += ch;
        }
      }
      if (!inWord) start = cursor;
      const result = { start, quote: quoteCh, word, items: [] };
      const fromList = (names) =>
        names
          .filter((nm) => nm.startsWith(word))
          .sort()
          .map((nm) => ({ text: nm, label: nm, dir: false }));

      if (cmdPos && !word.includes("/")) {
        result.items = fromList([...new Set([...Object.keys(commands), ...Object.keys(shell.aliases)])]);
        return result;
      }
      const prev = prevWords[prevWords.length - 1];
      if (["man", "which", "type", "help", "sudo", "unalias"].includes(firstWord) && wordIndex === 1) {
        result.items = fromList(firstWord === "unalias" ? Object.keys(shell.aliases) : Object.keys(commands));
        if (result.items.length) return result;
      }
      const words = extra[firstWord];
      if (words) {
        const list = typeof words === "function" ? words({ prev, wordIndex, word }) : words;
        if (list) {
          result.items = fromList(list);
          return result;
        }
      }
      if (firstWord === "unset" || (firstWord === "echo" && word.startsWith("$"))) {
        const pre = firstWord === "echo" ? "$" : "";
        result.items = fromList(Object.keys(shell.env).map((k) => pre + k));
        if (result.items.length || firstWord === "unset") return result;
      }

      // paths
      const slash = word.lastIndexOf("/");
      const dirPart = slash === -1 ? "" : word.slice(0, slash + 1);
      const base = slash === -1 ? word : word.slice(slash + 1);
      if (word === "~") {
        result.items = [{ text: "~", label: "~", dir: true }];
        return result;
      }
      const dir = shell.resolve(dirPart || ".");
      if (!fs.isDir(dir)) return result;
      const dirsOnly = firstWord === "cd" || firstWord === "rmdir";
      const entries = fs.list(dir, { hidden: base.startsWith(".") }).filter((e) => !dirsOnly || e.type === "dir");
      let hits = entries.filter((e) => e.name.startsWith(base));
      let ci = false;
      if (!hits.length && base) {
        hits = entries.filter((e) => e.name.toLowerCase().startsWith(base.toLowerCase()));
        ci = true;
      }
      result.caseInsensitive = ci;
      result.items = hits
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ text: dirPart + e.name, label: e.name, dir: e.type === "dir" }));
      return result;
    },
  };
  return shell;
}

/** Quote a string so the tokenizer reads it back as one literal word. */
export function quote(s) {
  if (s === "") return "''";
  if (/^[A-Za-z0-9_\-./:=@%+,~]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** Backslash-escape a completion result for insertion on the command line. */
export function escapeWord(text, quoteCh) {
  if (quoteCh === "'") return text;
  if (quoteCh === '"') return text.replace(/(["\\$`])/g, "\\$1");
  const lead = text === "~" || text.startsWith("~/") ? "~" : "";
  return lead + text.slice(lead.length).replace(/([\s'"\\$&|;<>()*?#!`{}[\]~])/g, "\\$1");
}

export function commonPrefix(strings) {
  if (!strings.length) return "";
  let p = strings[0];
  for (const s of strings) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}
