// macOS Control Center slider: a rounded track whose white fill ends in a round knob.
import { useRef } from "react";

const KNOB = 24;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** value / onChange are 0..1 (map ranges outside). */
export default function Slider({ value, onChange, label, icon, step = 0.05 }) {
  const ref = useRef(null);
  const v = clamp01(value);

  const fromPointer = (e) => {
    const r = ref.current.getBoundingClientRect();
    onChange(clamp01((e.clientX - r.left - KNOB / 2) / Math.max(1, r.width - KNOB)));
  };

  return (
    <div
      ref={ref}
      className="sys-slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
      }}
      onKeyDown={(e) => {
        const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 0.2, PageDown: -0.2 }[e.key];
        if (d !== undefined) onChange(clamp01(v + d));
        else if (e.key === "Home") onChange(0);
        else if (e.key === "End") onChange(1);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className="sys-slider-fill"
        style={{ transform: `translateX(calc(${KNOB}px - 100% + (100% - ${KNOB}px) * ${v.toFixed(4)}))` }}
      />
      <span className="sys-slider-icon">{icon}</span>
    </div>
  );
}
