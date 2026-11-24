// App switcher HUD (Alt+` / Ctrl+`): running apps, most recent first.
import { motion as Motion } from "framer-motion";
import { getApp } from "../../apps";
import { useSettings } from "../../settingsStore";

export default function Switcher({ apps, index, onPick }) {
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const current = getApp(apps[index]);
  return (
    <Motion.div
      className="sw-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.12 }}
    >
      <Motion.div
        className="sw-panel"
        role="listbox"
        aria-label="Switch application"
        aria-activedescendant={current ? `sw-${current.id}` : undefined}
        initial={reduceMotion ? false : { scale: 0.94 }}
        animate={{ scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 36 }}
      >
        <div className="sw-row">
          {apps.map((id, i) => {
            const app = getApp(id);
            if (!app) return null;
            return (
              <div
                key={id}
                id={`sw-${id}`}
                role="option"
                aria-selected={i === index}
                className="sw-item"
                data-active={i === index || undefined}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onPick(i);
                }}
              >
                <img src={app.icon} alt="" draggable={false} decoding="async" />
              </div>
            );
          })}
        </div>
        <div className="sw-name" aria-live="polite">
          {current?.name}
        </div>
      </Motion.div>
    </Motion.div>
  );
}
