// Notification Center: notification history + calendar, clock and system widgets.
import { memo, useMemo, useRef, useState } from "react";
import { motion as Motion } from "framer-motion";
import { LuAppWindow, LuChevronLeft, LuChevronRight, LuGlobe, LuMonitor, LuTimer } from "react-icons/lu";
import { useWindows } from "../../windowStore";
import { useSettings } from "../../settingsStore";
import { ui, useUI } from "../../ui";
import { DAYS, MONTHS_LONG, formatLongDate, formatTime, formatUptime, useDismiss, useNow, useOnline } from "./hooks";
import { BOOT_TIME, runNotification } from "./sysStore";
import { NoteCard } from "./Notifications";

// ---- calendar ---------------------------------------------------------------------
const CalendarWidget = memo(function CalendarWidget() {
  const now = useNow(60000);
  const [view, setView] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const isCurrent = view.y === now.getFullYear() && view.m === now.getMonth();

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const start = new Date(view.y, view.m, 1 - first.getDay());
    const daysIn = new Date(view.y, view.m + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + daysIn) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { d, key: i, out: d.getMonth() !== view.m, weekend: d.getDay() === 0 || d.getDay() === 6 };
    });
  }, [view]);

  const shift = (dir) =>
    setView((v) => {
      const d = new Date(v.y, v.m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const todayKey = now.toDateString();

  return (
    <section className="sys-widget sys-widget--wide sys-card" aria-label="Calendar">
      <div className="sys-cal-head">
        <span className="sys-cal-month">
          {MONTHS_LONG[view.m]} <span className="sys-cal-year">{view.y}</span>
        </span>
        {!isCurrent && (
          <button
            type="button"
            className="sys-cal-nav sys-cal-today-btn"
            onClick={() => setView({ y: now.getFullYear(), m: now.getMonth() })}
          >
            Today
          </button>
        )}
        <button type="button" className="sys-cal-nav" aria-label="Previous month" onClick={() => shift(-1)}>
          <LuChevronLeft />
        </button>
        <button type="button" className="sys-cal-nav" aria-label="Next month" onClick={() => shift(1)}>
          <LuChevronRight />
        </button>
      </div>
      <div className="sys-cal-grid" role="grid">
        {DAYS.map((d) => (
          <div key={d} className="sys-cal-dow" role="columnheader">
            {d[0]}
          </div>
        ))}
        {cells.map((c) => (
          <div
            key={c.key}
            className="sys-cal-day"
            role="gridcell"
            data-out={c.out}
            data-weekend={c.weekend}
            data-today={c.d.toDateString() === todayKey}
            aria-current={c.d.toDateString() === todayKey ? "date" : undefined}
          >
            <span>{c.d.getDate()}</span>
          </div>
        ))}
      </div>
    </section>
  );
});

// ---- clock --------------------------------------------------------------------------
const TICKS = Array.from({ length: 12 }, (_, i) => i);
const zone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.replace(/_/g, " ") || "";
  } catch {
    return "";
  }
})();

const ClockWidget = memo(function ClockWidget({ reduceMotion }) {
  const now = useNow(1000);
  const h24 = useSettings((s) => s.clock24h);
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  return (
    <section className="sys-widget sys-card sys-clock-w" aria-label="Clock">
      <svg className="sys-clock-face" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="face" cx="50" cy="50" r="48" strokeWidth="1" />
        {TICKS.map((i) => (
          <line
            key={i}
            className={`tick${i % 3 === 0 ? " tick--major" : ""}`}
            x1="50"
            y1="6"
            x2="50"
            y2={i % 3 === 0 ? 13 : 10}
            strokeWidth={i % 3 === 0 ? 2.2 : 1.4}
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
        <line className="hand" x1="50" y1="54" x2="50" y2="27" strokeWidth="3.6" transform={`rotate(${h * 30} 50 50)`} />
        <line className="hand" x1="50" y1="56" x2="50" y2="15" strokeWidth="2.4" transform={`rotate(${m * 6} 50 50)`} />
        {!reduceMotion && (
          <line className="hand hand--sec" x1="50" y1="60" x2="50" y2="12" strokeWidth="1.1" transform={`rotate(${s * 6} 50 50)`} />
        )}
        <circle className="hub" cx="50" cy="50" r="2.6" />
      </svg>
      <div className="sys-clock-meta">
        <div className="sys-clock-time">{formatTime(now, h24)}</div>
        <div className="sys-clock-zone" title={zone}>
          {zone || formatLongDate(now)}
        </div>
      </div>
    </section>
  );
});

// ---- system -------------------------------------------------------------------------
const SystemWidget = memo(function SystemWidget() {
  const now = useNow(1000);
  const count = useWindows((s) => s.windows.filter((w) => !w.closing).length);
  const theme = useSettings((s) => s.theme);
  const online = useOnline();
  const rows = [
    { icon: <LuTimer />, k: "Uptime", v: formatUptime(now.getTime() - BOOT_TIME) },
    { icon: <LuAppWindow />, k: "Open windows", v: String(count) },
    { icon: <LuMonitor />, k: "Appearance", v: theme === "dark" ? "Dark" : "Light" },
    { icon: <LuGlobe />, k: "Network", v: online ? "Online" : "Offline" },
  ];
  return (
    <section className="sys-widget sys-card" aria-label="System">
      <div className="sys-stats">
        <div className="sys-stats-title">SherlockOS</div>
        {rows.map((r) => (
          <div key={r.k} className="sys-stat">
            <span className="sys-stat-ic">{r.icon}</span>
            <span className="sys-stat-txt">
              <span className="sys-stat-v">{r.v}</span>
              <span className="sys-stat-k">{r.k}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
});

// ---- panel --------------------------------------------------------------------------
export default function NotificationCenter({ reduceMotion }) {
  const ref = useRef(null);
  const close = () => ui.setOverlay(null);
  useDismiss(ref, close);
  const notifications = useUI((s) => s.notifications);
  const now = useNow(30000).getTime();

  const remove = (id) => useUI.setState((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));

  return (
    <Motion.aside
      ref={ref}
      className="sys-nc"
      aria-label="Notification Center"
      initial={reduceMotion ? { opacity: 0 } : { x: "105%" }}
      animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { x: "105%", transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } }}
      transition={reduceMotion ? { duration: 0.14 } : { type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="sys-nc-head">
        <h2>Notifications</h2>
        {notifications.length > 0 && (
          <button type="button" className="sys-nc-clear" onClick={() => ui.clearNotifications()}>
            Clear All
          </button>
        )}
      </div>
      <div className="sys-nc-list">
        {notifications.length === 0 ? (
          <div className="sys-card sys-nc-empty">No Notifications</div>
        ) : (
          notifications.map((n) => (
            <NoteCard
              key={n.id}
              n={n}
              now={Math.max(now, n.time)}
              onActivate={
                n.onClick
                  ? () => {
                      close();
                      runNotification(n);
                    }
                  : undefined
              }
              onClose={() => remove(n.id)}
            />
          ))
        )}
      </div>
      <div className="sys-widgets">
        <ClockWidget reduceMotion={reduceMotion} />
        <SystemWidget />
        <CalendarWidget />
      </div>
    </Motion.aside>
  );
}
