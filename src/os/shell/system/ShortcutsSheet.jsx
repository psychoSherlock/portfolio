// Help → Keyboard Shortcuts: a sheet listing the shortcuts SherlockOS understands.
import { useRef } from "react";
import { motion as Motion } from "framer-motion";
import { LuX } from "react-icons/lu";
import { useDismiss } from "./hooks";
import { useSys } from "./sysStore";

const GROUPS = [
  {
    title: "System",
    rows: [
      ["Spotlight search", ["Ctrl", "Space"]],
      ["Spotlight search (when not typing)", ["/"]],
      ["Mission Control", ["F3"]],
      ["Launchpad", ["F4"]],
      ["Switch between apps", ["⌥", "`"]],
      ["Lock screen", ["⌥", "L"]],
      ["Keyboard shortcuts", ["⌥", "/"]],
    ],
  },
  {
    title: "Windows",
    rows: [
      ["New window", ["⌥", "N"]],
      ["Close window", ["⌥", "W"]],
      ["Minimize window", ["⌥", "M"]],
      ["Zoom window", ["⌥", "↩"]],
      ["Tile left / right", ["Drag to screen edge"]],
    ],
  },
  {
    title: "Menus",
    rows: [
      ["Move through items", ["↑", "↓"]],
      ["Open submenu / next menu", ["→"]],
      ["Close submenu / previous menu", ["←"]],
      ["Choose item", ["↩"]],
      ["Close menu or panel", ["Esc"]],
    ],
  },
];

export default function ShortcutsSheet({ reduceMotion }) {
  const ref = useRef(null);
  const close = () => useSys.setState({ shortcuts: false });
  useDismiss(ref, close, 60);
  return (
    <Motion.div
      className="sys-sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
    >
      <Motion.div
        ref={ref}
        className="sys-sheet sys-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sys-sheet-title"
        initial={reduceMotion ? false : { scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={reduceMotion ? undefined : { scale: 0.97, y: 4 }}
        transition={{ type: "spring", stiffness: 520, damping: 38 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="sys-sheet-head">
          <h2 id="sys-sheet-title">Keyboard Shortcuts</h2>
          <button type="button" className="os-icon-btn" aria-label="Close" onClick={close}>
            <LuX />
          </button>
        </div>
        <div className="sys-sheet-body os-scroll">
          {GROUPS.map((g) => (
            <section key={g.title} className="sys-sheet-group">
              <h3>{g.title}</h3>
              {g.rows.map(([label, keys]) => (
                <div key={label} className="sys-sheet-row">
                  <span>{label}</span>
                  <span className="sys-sheet-keys">
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Motion.div>
    </Motion.div>
  );
}
