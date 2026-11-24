// "Shut Down…": the screen goes dark; the power button boots SherlockOS again.
import { useEffect } from "react";
import { motion as Motion } from "framer-motion";
import { LuPower } from "react-icons/lu";
import { onKeys, restart } from "./sysStore";

export default function PowerOff({ reduceMotion }) {
  // While off, the keyboard does nothing except "press the power button".
  useEffect(
    () =>
      onKeys((e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) restart();
        return true;
      }, 2000),
    []
  );

  return (
    <Motion.div
      className="sys-off"
      role="dialog"
      aria-modal="true"
      aria-label="SherlockOS is shut down"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.9, ease: "easeInOut" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Motion.button
        type="button"
        className="sys-off-btn"
        aria-label="Power on"
        title="Power on"
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: reduceMotion ? 0 : 1.6, duration: reduceMotion ? 0.15 : 0.6 }}
        onClick={restart}
      >
        <LuPower />
      </Motion.button>
      <Motion.div
        className="sys-off-hint"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduceMotion ? 0 : 2.2, duration: 0.6 }}
      >
        Press the power button or Enter to start up
      </Motion.div>
    </Motion.div>
  );
}
