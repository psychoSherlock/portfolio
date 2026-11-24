// Terminal: a zsh-flavoured shell over the SherlockOS virtual filesystem.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import fs, { HOME, tilde } from "../../os/fs";
import { wm, useWindows } from "../../os/windowStore";
import { useSettings } from "../../os/settingsStore";
import { openPath, openUrl, openExternal } from "../../os/open";
import { contextMenu } from "../../os/ui";
import { createShell, flat, plain, abortError, escapeWord, commonPrefix, columnize } from "./shell.js";
import { highlight, splitSegs, strftime } from "./lib.js";
import { COMMANDS } from "./commands/index.js";
import { APPS } from "../../os/apps";
import { pidOf } from "./procs.js";
import Screen from "./screens.jsx";
import "./terminal.css";

const USER = "sherlock";
const HOST = "sherlockos";
const MAX_LINES = 2000;
const HISTORY_KEY = "sherlockos.terminal.history";
const FONT_KEY = "sherlockos.terminal.fontSize";
const LOGIN_KEY = "sherlockos.terminal.lastLogin";
const MOTD_KEY = "sherlockos.terminal.motd";
const FONT_MIN = 9;
const FONT_MAX = 24;

let ttyCounter = 0;

// ---- storage helpers (all failures are non-fatal) ---------------------------
function readJSON(store, key, fallback) {
  try {
    const v = JSON.parse(window[store].getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(store, key, value) {
  try {
    window[store].setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

// ---- prompt -----------------------------------------------------------------
const promptTop = (cwd) => [
  { t: "┌──(", s: "pframe" },
  { t: `${USER}㉿${HOST}`, s: "puser" },
  { t: ")-[", s: "pframe" },
  { t: tilde(cwd), s: "ppath" },
  { t: "]", s: "pframe" },
];
const PROMPT_BOTTOM = [{ t: "└─", s: "pframe" }, { t: "$", s: "puser" }, { t: " " }];


// ---- rendering ----------------------------------------------------------------
function segClass(s) {
  return s.s ? s.s.split(" ").map((x) => `t-${x}`).join(" ") : undefined;
}

function renderSegs(segs, onLink) {
  return segs.map((s, i) => {
    const className = segClass(s);
    const style = s.color || s.bg ? { color: s.color, background: s.bg } : undefined;
    if (s.href) {
      return (
        <a
          key={i}
          className={className}
          style={style}
          href={/^https?:/i.test(s.href) ? s.href : undefined}
          onClick={(e) => {
            e.preventDefault();
            onLink(s.href, e);
          }}
          data-no-drag
        >
          {s.t}
        </a>
      );
    }
    if (!className && !style) return s.t;
    return (
      <span key={i} className={className} style={style}>
        {s.t}
      </span>
    );
  });
}

const Line = memo(function Line({ segs, onLink, cursor }) {
  return (
    <div className="terminal-line">
      {segs.length ? renderSegs(segs, onLink) : cursor ? null : " "}
      {cursor}
    </div>
  );
});

function Cursor({ ch, focused }) {
  return <span className={`terminal-cursor${focused ? " is-focused" : ""}`}>{ch === " " || !ch ? " " : ch}</span>;
}

// ---- component ------------------------------------------------------------------
export default function Terminal({ windowId, propsVersion, cwd: cwdProp }) {
  const transparency = useSettings((s) => s.transparency);
  const active = useWindows((s) => s.activeId === windowId);

  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const measureRef = useRef(null);
  const bufRef = useRef({ lines: [], nextId: 1, open: false, raf: 0 });
  const stickRef = useRef(true);
  const ctrlRef = useRef(null);
  const readRef = useRef(null); // { resolve, reject }
  const screenRef = useRef(null); // resolve()
  const screenKeysRef = useRef(null);
  const histRef = useRef({ index: -1, draft: "", saved: 0 });
  const tabRef = useRef({ last: 0, line: null });
  const killRef = useRef("");
  const bootedRef = useRef(false);

  const [lines, setLines] = useState([]);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState(false);
  const [readMode, setReadMode] = useState(null); // { prompt, hidden }
  const [screen, setScreen] = useState(null); // { kind, props }
  const [focused, setFocused] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    const v = Number(readJSON("localStorage", FONT_KEY, 13));
    return v >= FONT_MIN && v <= FONT_MAX ? v : 13;
  });

  // ---- output buffer ----
  const flush = useCallback(() => {
    const b = bufRef.current;
    if (b.raf) return;
    b.raf = requestAnimationFrame(() => {
      b.raf = 0;
      if (b.lines.length > MAX_LINES) b.lines.splice(0, b.lines.length - MAX_LINES);
      setLines(b.lines.slice());
    });
  }, []);

  const write = useCallback(
    (segs) => {
      const b = bufRef.current;
      const closeLine = () => {
        if (b.open) b.open = false;
        else b.lines.push({ id: b.nextId++, segs: [] });
      };
      const append = (seg) => {
        if (!b.open) {
          b.lines.push({ id: b.nextId++, segs: [seg] });
          b.open = true;
        } else {
          const last = b.lines[b.lines.length - 1];
          b.lines[b.lines.length - 1] = { id: last.id, segs: [...last.segs, seg] };
        }
      };
      for (const seg of flat(segs)) {
        const parts = seg.t.replace(/\r\n?/g, "\n").split("\n");
        parts.forEach((part, i) => {
          if (i > 0) closeLine();
          if (part) append({ ...seg, t: part });
        });
      }
      if (b.lines.length > MAX_LINES * 1.5) b.lines.splice(0, b.lines.length - MAX_LINES);
      flush();
    },
    [flush]
  );

  const clearScreen = useCallback(() => {
    const b = bufRef.current;
    b.lines = [];
    b.open = false;
    flush();
  }, [flush]);

  // ---- shell + terminal device (created once per window) ----
  const [shell] = useState(() =>
    createShell({
      fs,
      commands: COMMANDS,
      home: HOME,
      cwd: cwdProp && fs.isDir(cwdProp) ? cwdProp : HOME,
      history: [].concat(readJSON("sessionStorage", HISTORY_KEY, [])).filter((x) => typeof x === "string"),
      user: USER,
      host: HOST,
    })
  );
  const [cwd, setCwd] = useState(shell.cwd);
  const isCmd = useCallback(
    (name) =>
      !!name &&
      (Object.hasOwn(COMMANDS, name) ||
        Object.hasOwn(shell.aliases, name) ||
        (name.includes("/") && fs.isDir(shell.resolve(name)))),
    [shell]
  );
  const pathExists = useCallback((p) => fs.exists(shell.resolve(p)), [shell]);

  const [term] = useState(() => ({
    windowId,
    cols: 80,
    rows: 24,
    fontSize: 13,
    fontName: "SF Mono",
  }));

  const saveHistory = useCallback(
    (overwrite = false) => {
      const h = histRef.current;
      if (overwrite) {
        writeJSON("sessionStorage", HISTORY_KEY, shell.history.slice(-1000));
      } else {
        const stored = readJSON("sessionStorage", HISTORY_KEY, []);
        const fresh = shell.history.slice(h.saved);
        const merged = [...stored];
        for (const e of fresh) if (merged[merged.length - 1] !== e) merged.push(e);
        writeJSON("sessionStorage", HISTORY_KEY, merged.slice(-1000));
      }
      h.saved = shell.history.length;
    },
    [shell]
  );

  useEffect(() => {
    histRef.current.saved = shell.history.length;
    shell.bootTime = performance.timeOrigin;
    Object.assign(term, {
      clear: clearScreen,
      exit: () => wm.close(windowId),
      saveHistory: () => saveHistory(true),
      readLine: ({ prompt = "", hidden = false, signal } = {}) =>
        new Promise((resolve, reject) => {
          if (signal?.aborted) return reject(abortError());
          setReadMode({ prompt, hidden });
          setInput("");
          setCursor(0);
          const onAbort = () => {
            readRef.current = null;
            setReadMode(null);
            reject(abortError());
          };
          signal?.addEventListener("abort", onAbort, { once: true });
          readRef.current = {
            resolve: (v) => {
              signal?.removeEventListener("abort", onAbort);
              readRef.current = null;
              setReadMode(null);
              resolve(v);
            },
          };
        }),
      takeover: (kind, props, signal) =>
        new Promise((resolve) => {
          const done = () => {
            signal?.removeEventListener("abort", done);
            screenRef.current = null;
            screenKeysRef.current = null;
            setScreen(null);
            resolve();
          };
          if (signal?.aborted) return resolve();
          signal?.addEventListener("abort", done, { once: true });
          screenRef.current = done;
          setScreen({ kind, props });
        }),
    });
  }, [term, shell, windowId, clearScreen, saveHistory]);

  // ---- MOTD ----
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const prev = readJSON("localStorage", LOGIN_KEY, null);
    writeJSON("localStorage", LOGIN_KEY, Date.now());
    ttyCounter += 1;
    const when = strftime("%a %b %e %T", new Date(typeof prev === "number" ? prev : Date.now()));
    write([{ t: `Last login: ${when} on ttys${String(ttyCounter).padStart(3, "0")}\n` }]);
    let shown = false;
    try {
      shown = window.sessionStorage.getItem(MOTD_KEY) === "1";
      window.sessionStorage.setItem(MOTD_KEY, "1");
    } catch {
      /* ignore */
    }
    if (!shown) {
      write([
        "Type ",
        { t: "help", s: "bold accent link", href: "cmd:help" },
        " to get started, or try ",
        { t: "neofetch", s: "bold accent link", href: "cmd:neofetch" },
        ".\n",
      ]);
    }
  }, [write]);

  // ---- title ----
  useEffect(() => {
    wm.setTitle(windowId, `${USER}@${HOST}: ${tilde(cwd)}`);
  }, [windowId, cwd]);

  // ---- props: another app asked this window to cd somewhere ----
  useEffect(() => {
    if (!propsVersion || !cwdProp || !fs.isDir(cwdProp) || ctrlRef.current) return;
    if (shell.cwd !== cwdProp) {
      shell.setCwd(cwdProp);
      setCwd(cwdProp);
    }
  }, [propsVersion, cwdProp, shell]);

  // ---- measuring cols/rows ----
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const m = measureRef.current;
    if (!el || !m) return;
    const measure = () => {
      const r = m.getBoundingClientRect();
      const cw = r.width / 20 || 8;
      const lh = r.height || 17;
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      term.cols = Math.max(20, Math.floor(w / cw));
      term.rows = Math.max(5, Math.floor(h / lh));
      term.fontSize = fontSize;
      term.fontName = (cs.fontFamily.split(",")[0] || "monospace").replace(/["']/g, "").trim();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [term, fontSize]);

  // ---- focus ----
  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (active) focusInput();
  }, [active, focusInput]);

  // ---- auto scroll ----
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [lines, input, readMode, running, screen]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
  }, []);

  // ---- abort anything still running when the window goes away ----
  useEffect(() => {
    flush(); // (re)mount: paint whatever is already buffered
    const b = bufRef.current;
    return () => {
      ctrlRef.current?.abort();
      if (b.raf) cancelAnimationFrame(b.raf);
      b.raf = 0;
    };
  }, [flush]);

  // ---- running commands ----
  const echoPrompt = useCallback(
    (line, suffix) => {
      write([promptTop(shell.cwd), "\n", PROMPT_BOTTOM, highlight(line, isCmd, pathExists), suffix || "", "\n"]);
    },
    [shell, write, isCmd, pathExists]
  );

  const runLine = useCallback(
    async (line) => {
      echoPrompt(line);
      histRef.current.index = -1;
      histRef.current.draft = "";
      if (!line.trim()) return;
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setRunning(true);
      try {
        await shell.exec(line, { write, term, signal: ctrl.signal });
      } catch (e) {
        if (e?.name !== "AbortError") write([{ t: `zsh: ${e?.message || e}\n`, s: "red" }]);
      }
      // PROMPT_SP: mark a missing trailing newline like zsh does
      if (bufRef.current.open) write([{ t: "%", s: "inverse bold" }, "\n"]);
      ctrlRef.current = null;
      setRunning(false);
      setCwd(shell.cwd);
      saveHistory();
    },
    [echoPrompt, shell, write, term, saveHistory]
  );

  const enterRef = useRef(null);
  useEffect(() => {
    enterRef.current = (value) => {
      if (!readRef.current) return;
      write([readMode?.prompt || "", readMode?.hidden ? "" : value, "\n"]);
      setLine("");
      readRef.current.resolve(value);
    };
  });

  const runLineRef = useRef(runLine);
  useEffect(() => {
    runLineRef.current = runLine;
  }, [runLine]);

  const onLink = useCallback(
    (href, e) => {
      if (window.getSelection()?.toString()) return;
      if (href.startsWith("cmd:")) {
        if (ctrlRef.current) return;
        stickRef.current = true;
        runLineRef.current(href.slice(4));
        focusInput();
      } else if (href.startsWith("app:")) wm.open(href.slice(4));
      else if (href.startsWith("fs:")) openPath(href.slice(3));
      else if (href.startsWith("mailto:")) wm.open("mail");
      else if (e?.metaKey || e?.ctrlKey) openExternal(href);
      else openUrl(href);
    },
    [focusInput]
  );

  // ---- input editing helpers ----
  const setLine = useCallback((value, pos = value.length) => {
    setInput(value);
    setCursor(pos);
    const ta = inputRef.current;
    if (ta) {
      ta.value = value;
      ta.setSelectionRange(pos, pos);
    }
  }, []);

  const suggestion = useMemo(() => {
    if (readMode || running || !input || cursor !== input.length) return "";
    const h = shell.history;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].startsWith(input) && h[i] !== input) return h[i].slice(input.length);
    return "";
  }, [input, cursor, readMode, running, shell, lines]); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = useCallback(() => {
    const extra = {
      open: ({ prev }) => (prev === "-a" ? COMMAND_APPS() : null),
      theme: ({ wordIndex }) => (wordIndex === 1 ? ["dark", "light", "toggle"] : []),
      accent: ({ wordIndex }) => (wordIndex === 1 ? ["purple", "blue", "green", "orange", "pink", "htb", "cyan", "--list"] : []),
      wallpaper: ({ word }) => (word.includes("/") ? null : ["--list", ...fs.list(`${HOME}/Pictures/Wallpapers`).map((e) => e.name)]),
      kill: () => useWindows.getState().windows.filter((w) => !w.closing).map((w) => String(pidOf(w.id))),
      socials: ({ wordIndex }) => (wordIndex === 1 ? ["github", "x", "linkedin", "hackerone", "medium", "linktree", "website"] : []),
      nmap: () => ["localhost", "-sV", "-A"],
    };
    const res = shell.complete(input, cursor, extra);
    const now = Date.now();
    const again = tabRef.current.line === input && now - tabRef.current.last < 1500;
    tabRef.current = { last: now, line: input };
    if (!res.items.length) return;
    const replaceWith = (text, closing) => {
      const ins = escapeWord(text, res.quote) + closing;
      const before = input.slice(0, res.start);
      const after = input.slice(cursor);
      const next = before + ins + after;
      setLine(next, before.length + ins.length);
      tabRef.current.line = next;
    };
    if (res.items.length === 1) {
      const it = res.items[0];
      replaceWith(it.text, it.dir ? "/" : res.quote ? res.quote + " " : " ");
      return;
    }
    const prefix = commonPrefix(res.items.map((x) => x.text));
    if (prefix.length > res.word.length || (res.caseInsensitive && prefix.length >= res.word.length && prefix !== res.word)) {
      replaceWith(prefix, "");
      return;
    }
    if (again) {
      // list candidates below the prompt (zsh-style), then keep editing
      echoPrompt(input);
      const cells = res.items.slice(0, 400).map((it) => {
        const seg = it.dir ? [{ t: `${it.label}/`, s: "blue bold" }] : [{ t: it.label, s: Object.hasOwn(COMMANDS, it.label) && !res.word.includes("/") && res.start === 0 ? "green" : undefined }];
        return { text: plain(seg), seg: flat(seg) };
      });
      for (const l of columnize(cells, term.cols)) write([l, "\n"]);
      if (res.items.length > 400) write([{ t: `… and ${res.items.length - 400} more\n`, s: "gray" }]);
    }
  }, [input, cursor, shell, setLine, echoPrompt, write, term]);

  const changeFont = useCallback((delta) => {
    setFontSize((f) => {
      const next = delta === 0 ? 13 : Math.max(FONT_MIN, Math.min(FONT_MAX, f + delta));
      writeJSON("localStorage", FONT_KEY, next);
      return next;
    });
  }, []);

  const interrupt = useCallback(() => {
    if (ctrlRef.current) {
      write([{ t: "^C", s: "gray" }, "\n"]);
      ctrlRef.current.abort();
      return;
    }
    echoPrompt(input, { t: "^C", s: "gray" });
    setLine("");
    histRef.current.index = -1;
  }, [write, echoPrompt, input, setLine]);

  const onKeyDown = useCallback(
    (e) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      const ctrl = e.ctrlKey && !e.altKey;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      stickRef.current = true;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      // font size (Ctrl/Cmd + = / - / 0)
      if (mod && (key === "=" || key === "+")) return stop(), changeFont(1);
      if (mod && key === "-") return stop(), changeFont(-1);
      if (mod && key === "0") return stop(), changeFont(0);

      // copy: Cmd+C natively, Ctrl+Shift+C like Linux terminals, Ctrl+C when text is selected
      const selected = window.getSelection()?.toString() || "";
      if (e.metaKey && (key === "c" || key === "C")) return;
      if (ctrl && e.shiftKey && (key === "c" || key === "C")) {
        stop();
        if (selected) navigator.clipboard?.writeText(selected).catch(() => {});
        return;
      }
      if (ctrl && (key === "c" || key === "C") && selected && !ctrlRef.current) return;

      if (ctrl && (key === "c" || key === "C")) return stop(), interrupt();

      // full-screen program owns the keyboard
      if (screenRef.current) {
        stop();
        screenKeysRef.current?.(e);
        return;
      }

      if ((ctrl && (key === "l" || key === "L")) || (e.metaKey && (key === "k" || key === "K"))) {
        stop();
        clearScreen();
        return;
      }

      // reading a line for a running program (sudo password)
      if (readRef.current) {
        if (key === "Enter") {
          stop();
          enterRef.current?.(input);
        } else if (ctrl && key === "d") {
          stop();
          readRef.current.resolve("");
        }
        return;
      }

      // a command is running: swallow typing
      if (ctrlRef.current) {
        if (!e.metaKey) stop();
        return;
      }

      const len = input.length;
      if (key === "Enter") {
        stop();
        const line = input;
        setLine("");
        runLine(line);
        return;
      }
      if (key === "Tab") {
        stop();
        complete();
        return;
      }
      if (key === "ArrowUp" || key === "ArrowDown" || (ctrl && (key === "p" || key === "n"))) {
        stop();
        const h = histRef.current;
        const hist = shell.history;
        if (!hist.length) return;
        const up = key === "ArrowUp" || key === "p";
        if (h.index === -1) {
          if (!up) return;
          h.draft = input;
          h.index = hist.length - 1;
        } else if (up) h.index = Math.max(0, h.index - 1);
        else if (h.index >= hist.length - 1) {
          h.index = -1;
          setLine(h.draft);
          return;
        } else h.index += 1;
        setLine(hist[h.index]);
        return;
      }
      const wordLeft = (pos) => {
        let i = pos;
        while (i > 0 && /\s/.test(input[i - 1])) i--;
        while (i > 0 && !/[\s/]/.test(input[i - 1])) i--;
        return i;
      };
      const wordRight = (pos) => {
        let i = pos;
        while (i < len && /\s/.test(input[i])) i++;
        while (i < len && !/[\s/]/.test(input[i])) i++;
        return i;
      };
      if (key === "ArrowLeft") {
        stop();
        setLine(input, e.altKey || mod ? wordLeft(cursor) : Math.max(0, cursor - 1));
        return;
      }
      if (key === "ArrowRight") {
        stop();
        if (cursor === len && suggestion) setLine(input + suggestion);
        else setLine(input, e.altKey || mod ? wordRight(cursor) : Math.min(len, cursor + 1));
        return;
      }
      if (key === "Home" || (ctrl && key === "a")) return stop(), setLine(input, 0);
      if (key === "End" || (ctrl && key === "e")) {
        stop();
        if (cursor === len && suggestion) setLine(input + suggestion);
        else setLine(input, len);
        return;
      }
      if (ctrl && key === "u") {
        stop();
        killRef.current = input.slice(0, cursor);
        setLine(input.slice(cursor), 0);
        return;
      }
      if (ctrl && key === "k") {
        stop();
        killRef.current = input.slice(cursor);
        setLine(input.slice(0, cursor), cursor);
        return;
      }
      if (ctrl && key === "w") {
        stop();
        const i = wordLeft(cursor);
        killRef.current = input.slice(i, cursor);
        setLine(input.slice(0, i) + input.slice(cursor), i);
        return;
      }
      if (ctrl && key === "y") {
        stop();
        const k = killRef.current;
        setLine(input.slice(0, cursor) + k + input.slice(cursor), cursor + k.length);
        return;
      }
      if (ctrl && key === "d") {
        stop();
        if (!len) {
          write([promptTop(shell.cwd), "\n", PROMPT_BOTTOM, "\n"]);
          wm.close(windowId);
        } else if (cursor < len) setLine(input.slice(0, cursor) + input.slice(cursor + 1), cursor);
        return;
      }
      if (ctrl && key === "b") return stop(), setLine(input, Math.max(0, cursor - 1));
      if (ctrl && key === "f") return stop(), setLine(input, Math.min(len, cursor + 1));
      if (e.altKey && key === "b") return stop(), setLine(input, wordLeft(cursor));
      if (e.altKey && key === "f") return stop(), setLine(input, wordRight(cursor));
      if (ctrl && key === "h") {
        stop();
        if (cursor > 0) setLine(input.slice(0, cursor - 1) + input.slice(cursor), cursor - 1);
        return;
      }
      if (key === "Escape") return stop();
      // keep window-manager shortcuts away from plain typing
      if (!mod) e.stopPropagation();
    },
    [input, cursor, suggestion, shell, windowId, changeFont, interrupt, clearScreen, write, setLine, runLine, complete]
  );

  const onChange = useCallback((e) => {
    const ta = e.target;
    let v = ta.value;
    // mobile keyboards often deliver Enter as an inserted line break instead of a keydown
    const type = e.nativeEvent?.inputType || "";
    if ((type === "insertLineBreak" || type === "insertParagraph") && !ctrlRef.current) {
      const line = v.replace(/\n/g, "");
      if (readRef.current) {
        enterRef.current?.(line);
        return;
      }
      setLine("");
      runLineRef.current(line);
      return;
    }
    let pos = ta.selectionStart ?? v.length;
    if (v.includes("\n")) {
      const before = v.slice(0, pos).replace(/\n+$/, "");
      v = v.replace(/\n+$/, "").replace(/\n+/g, "; ");
      pos = Math.min(v.length, before.replace(/\n+/g, "; ").length);
    }
    setInput(v);
    setCursor(pos);
    histRef.current.index = -1;
  }, [setLine]);

  const onSelect = useCallback((e) => {
    const ta = e.target;
    if (ta.selectionStart === ta.selectionEnd) setCursor(ta.selectionStart);
  }, []);

  // keep the textarea in sync when state changes programmatically
  useLayoutEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    if (ta.value !== input) ta.value = input;
    if (document.activeElement === ta && (ta.selectionStart !== cursor || ta.selectionEnd !== cursor)) ta.setSelectionRange(cursor, cursor);
  }, [input, cursor]);

  const closeScreen = useCallback(() => screenRef.current?.(), []);

  // typing while the output (not the input) has focus: hand the key to the input
  const onRootKeyDown = useCallback(
    (e) => {
      if (e.target === inputRef.current) return;
      if (e.metaKey || (e.ctrlKey && (e.key === "c" || e.key === "C"))) return;
      if (e.key.length === 1 || ["Enter", "Backspace", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        window.getSelection()?.removeAllRanges();
        focusInput();
      }
    },
    [focusInput]
  );

  // ---- pointer / menu ----
  const onPointerUp = useCallback(
    (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("a")) return;
      const sel = window.getSelection();
      if (sel && sel.toString()) return;
      focusInput();
    },
    [focusInput]
  );

  const pasteText = useCallback(
    async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text || ctrlRef.current) return;
        const clean = text.replace(/\r/g, "").replace(/\n+$/, "").replace(/\n+/g, "; ");
        const next = input.slice(0, cursor) + clean + input.slice(cursor);
        setLine(next, cursor + clean.length);
      } catch {
        write([{ t: "Paste: clipboard access was denied - use Ctrl+V / ⌘V instead.\n", s: "gray" }]);
      }
      focusInput();
    },
    [input, cursor, setLine, write, focusInput]
  );

  const onContextMenu = useCallback(
    (e) => {
      const selection = window.getSelection()?.toString() || "";
      contextMenu(e, [
        {
          label: "Copy",
          shortcut: "⇧⌃C",
          disabled: !selection,
          onClick: () => navigator.clipboard?.writeText(selection).catch(() => {}),
        },
        { label: "Paste", shortcut: "⌃V", disabled: running && !readMode, onClick: pasteText },
        { separator: true },
        { label: "Clear", shortcut: "⌃L", onClick: clearScreen },
        { label: "Select All", onClick: () => {
          const el = scrollRef.current;
          if (!el) return;
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } },
        { separator: true },
        { label: "New Window", shortcut: "⌘N", onClick: () => wm.open("terminal", { cwd: shell.cwd }) },
        { label: "Bigger", shortcut: "⌃+", onClick: () => changeFont(1) },
        { label: "Smaller", shortcut: "⌃-", onClick: () => changeFont(-1) },
      ]);
    },
    [running, readMode, pasteText, clearScreen, shell, changeFont]
  );

  // ---- render ----
  const lastOpen = running && !readMode && bufRef.current.open && lines.length > 0;
  const cursorEl = <Cursor ch=" " focused={focused} />;
  const showPrompt = !running && !screen;

  let inputLine = null;
  if (showPrompt) {
    const segs = highlight(input, isCmd, pathExists);
    const [left, right] = splitSegs(segs, cursor);
    const under = right[0]?.t[0];
    const rest = right.length ? [{ ...right[0], t: right[0].t.slice(1) }, ...right.slice(1)].filter((s) => s.t) : [];
    const underStyle = right[0] ? segClass(right[0]) : undefined;
    inputLine = (
      <>
        <div className="terminal-line">{renderSegs(promptTop(cwd), onLink)}</div>
        <div className="terminal-line terminal-input-line">
          {renderSegs(PROMPT_BOTTOM, onLink)}
          {renderSegs(left, onLink)}
          <span className={underStyle}>
            <Cursor ch={under} focused={focused} />
          </span>
          {renderSegs(rest, onLink)}
          {suggestion ? <span className="t-gray">{suggestion}</span> : null}
        </div>
      </>
    );
  } else if (readMode) {
    inputLine = (
      <div className="terminal-line terminal-input-line">
        {readMode.prompt}
        {readMode.hidden ? null : input}
        {cursorEl}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`terminal-root${transparency ? " is-glass" : ""}`}
      style={{ "--terminal-font-size": `${fontSize}px` }}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
      onKeyDown={onRootKeyDown}
      tabIndex={-1}
    >
      <div ref={scrollRef} className="terminal-scroll os-scroll os-selectable" onScroll={onScroll} aria-live="polite" aria-label="Terminal output">
        {lines.map((l, i) => (
          <Line key={l.id} segs={l.segs} onLink={onLink} cursor={lastOpen && i === lines.length - 1 ? cursorEl : null} />
        ))}
        {running && !readMode && !lastOpen && !screen ? <div className="terminal-line">{cursorEl}</div> : null}
        {inputLine}
      </div>
      <span ref={measureRef} className="terminal-measure" aria-hidden="true">
        MMMMMMMMMMMMMMMMMMMM
      </span>
      {screen ? (
        <Screen
          kind={screen.kind}
          props={screen.props}
          keys={screenKeysRef}
          onExit={closeScreen}
        />
      ) : null}
      <textarea
        ref={inputRef}
        className="terminal-input"
        defaultValue=""
        onChange={onChange}
        onKeyDown={onKeyDown}
        onSelect={onSelect}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="enter"
        aria-label="Terminal input"
        rows={1}
      />
    </div>
  );
}

const COMMAND_APPS = () => APPS.map((a) => (a.name.includes(" ") ? a.id : a.name));
