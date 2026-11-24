// Open windows presented as Unix processes (ps / kill / htop).
import { useWindows, wm } from "../../os/windowStore";
import { getApp } from "../../os/apps";
import { hash } from "./lib.js";

export const BOOT = typeof performance !== "undefined" ? performance.timeOrigin : Date.now();

/** Processes that "always run". They cannot be killed. */
export const SYSTEM_PROCS = [
  { pid: 1, user: "root", cmd: "/sbin/init splash", name: "systemd" },
  { pid: 2, user: "root", cmd: "[kthreadd]", name: "kthreadd" },
  { pid: 318, user: "root", cmd: "/usr/lib/systemd/systemd-journald", name: "systemd-journal" },
  { pid: 402, user: "root", cmd: "/usr/sbin/NetworkManager --no-daemon", name: "NetworkManager" },
  { pid: 611, user: "sherlock", cmd: "/usr/bin/sherlockos-wm --compositor", name: "sherlockos-wm" },
  { pid: 624, user: "sherlock", cmd: "/usr/libexec/sherlockos/menubar", name: "menubar" },
  { pid: 627, user: "sherlock", cmd: "/usr/libexec/sherlockos/dock", name: "dock" },
  { pid: 633, user: "sherlock", cmd: "/usr/bin/pipewire", name: "pipewire" },
];

export const pidOf = (windowId) => 1000 + Number(String(windowId).replace(/\D/g, "") || 0) * 7;

/** Live window processes. */
export function windowProcs(windows = useWindows.getState().windows) {
  return windows
    .filter((w) => !w.closing)
    .map((w) => {
      const app = getApp(w.appId);
      return {
        pid: pidOf(w.id),
        user: "sherlock",
        name: w.appId === "terminal" ? "zsh" : (app?.name || w.appId).replace(/\s+/g, ""),
        cmd:
          w.appId === "terminal"
            ? `-zsh  (${w.title})`
            : `/Applications/${app?.name || w.appId}.app${w.props?.path ? ` ${w.props.path}` : ""}`,
        title: w.title,
        windowId: w.id,
        appId: w.appId,
        minimized: w.minimized,
      };
    });
}

/** Deterministic but lively CPU / MEM numbers for a process at a given tick. */
export function usage(p, tick = 0) {
  const h = hash(`${p.pid}`);
  const base = p.windowId ? 0.4 + (h % 60) / 10 : (h % 8) / 10;
  const wobble = ((hash(`${p.pid}:${tick}`) % 100) / 100) * (p.windowId ? 3.5 : 0.6);
  const cpu = p.minimized ? 0 : base + wobble;
  const mem = p.windowId ? 0.6 + (h % 35) / 10 : 0.1 + (h % 6) / 10;
  return { cpu, mem, rss: Math.round(mem * 163.84 * 1024), virt: Math.round((mem * 4 + 380) * 1024) };
}

/** Kill a pid. Returns null on success or an error string. */
export function killPid(pid) {
  if (SYSTEM_PROCS.some((p) => p.pid === pid)) return "operation not permitted";
  const proc = windowProcs().find((p) => p.pid === pid);
  if (!proc) return "no such process";
  wm.close(proc.windowId);
  return null;
}
