// Notification banners (top-right toasts) + the shared notification card.
import { memo } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { LuBell, LuX } from "react-icons/lu";
import { getApp } from "../../apps";
import { ui, useUI } from "../../ui";
import { renderIcon } from "./renderIcon";
import { formatAgo, useNow } from "./hooks";
import { runNotification } from "./sysStore";

export const NoteCard = memo(function NoteCard({ n, now, onActivate, onClose, className = "" }) {
  const app = n.appId ? getApp(n.appId) : null;
  const icon = n.icon || app?.icon;
  const clickable = !!n.onClick;
  return (
    <div
      className={`sys-note sys-card ${className}`}
      role={clickable ? "button" : "status"}
      tabIndex={clickable ? 0 : undefined}
      data-clickable={clickable}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onActivate?.();
        }
      }}
    >
      <span className="sys-note-icon">{icon ? renderIcon(icon) : <LuBell />}</span>
      <div className="sys-note-main">
        <div className="sys-note-top">
          <span className="sys-note-title">{n.title || app?.name || "Notification"}</span>
          <span className="sys-note-time">{formatAgo(n.time, now)}</span>
        </div>
        {n.body ? <div className="sys-note-body">{n.body}</div> : null}
      </div>
      {onClose && (
        <button
          type="button"
          className="sys-note-close"
          aria-label="Dismiss notification"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <LuX />
        </button>
      )}
    </div>
  );
});

export function Toasts({ reduceMotion, hidden }) {
  const toasts = useUI((s) => s.toasts);
  const now = useNow(30000).getTime();
  const shown = hidden ? [] : toasts.slice(-4);
  return (
    <div className="sys-toasts" aria-live="polite">
      <AnimatePresence initial={false}>
        {shown.map((t) => (
          <Motion.div
            key={t.id}
            layout={!reduceMotion}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 380 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 380, transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } }}
            transition={reduceMotion ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
          >
            <NoteCard
              n={t}
              now={Math.max(now, t.time)}
              onActivate={() => {
                ui.dismissToast(t.id);
                runNotification(t);
              }}
              onClose={() => ui.dismissToast(t.id)}
            />
          </Motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
