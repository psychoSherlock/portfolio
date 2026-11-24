// Reusable System Settings controls: Group/Row, Switch, Slider, Segmented, Select, Swatches, ConfirmSheet.
import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LuCheck, LuChevronsUpDown, LuPipette } from "react-icons/lu";

const MotionDiv = motion.div;

/** A titled, rounded "inset list" card. */
export function Group({ title, footer, children, className = "" }) {
  return (
    <section className={`settings-group ${className}`}>
      {title && <h3 className="settings-group-title">{title}</h3>}
      <div className="settings-card">{children}</div>
      {footer && <p className="settings-group-footer">{footer}</p>}
    </section>
  );
}

/** A row inside a Group: label (+ optional description) on the left, control on the right. */
export function Row({ label, description, icon, children, stacked = false, labelId }) {
  return (
    <div className={`settings-row${stacked ? " settings-row--stacked" : ""}`}>
      <div className="settings-row-text">
        {icon && <span className="settings-row-icon">{icon}</span>}
        <div className="settings-row-labels">
          <span className="settings-row-label" id={labelId}>
            {label}
          </span>
          {description && <span className="settings-row-desc">{description}</span>}
        </div>
      </div>
      {children != null && <div className="settings-row-control">{children}</div>}
    </div>
  );
}

/** Read-only key/value row. */
export function InfoRow({ label, value }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>
      </div>
      <div className="settings-row-control settings-row-value os-selectable">{value}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label, labelledBy, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      className="settings-switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch-fill" />
      <span className="settings-switch-knob" />
    </button>
  );
}

/** Row + Switch wired together (the label names the switch). */
export function SwitchRow({ label, description, checked, onChange, icon }) {
  const id = useId();
  return (
    <Row label={label} description={description} icon={icon} labelId={id}>
      <Switch checked={checked} onChange={onChange} labelledBy={id} />
    </Row>
  );
}

/** Native range input (keyboard accessible for free) with an accent-filled track. */
export function Slider({ value, min = 0, max = 1, step = 0.01, onChange, label, before, after, ticks }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="settings-slider">
      {before && <span className="settings-slider-cap">{before}</span>}
      <div className="settings-slider-track-wrap">
        <input
          type="range"
          className="settings-slider-input"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          style={{ "--pct": `${Math.min(100, Math.max(0, pct))}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {ticks && (
          <div className="settings-slider-ticks" aria-hidden="true">
            {Array.from({ length: ticks }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
      </div>
      {after && <span className="settings-slider-cap">{after}</span>}
    </div>
  );
}

/** Segmented control (radio group) with a sliding thumb. options: [{ value, label }] */
export function Segmented({ value, options, onChange, label }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const ref = useRef(null);
  const onKeyDown = (e) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (index + dir + options.length) % options.length;
    onChange(options[next].value);
    ref.current?.querySelectorAll("button")[next]?.focus();
  };
  return (
    <div
      ref={ref}
      className="settings-segmented"
      role="radiogroup"
      aria-label={label}
      style={{ "--count": options.length, "--index": index }}
      onKeyDown={onKeyDown}
    >
      <span className="settings-segmented-thumb" aria-hidden="true" />
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          className="settings-segmented-item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pop-up button (native select underneath, macOS look). options: [{ value, label }] */
export function Select({ value, options, onChange, label }) {
  return (
    <span className="settings-select">
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="settings-select-chevron" aria-hidden="true">
        <LuChevronsUpDown />
      </span>
    </span>
  );
}

/** Color swatches + a custom color well. */
export function Swatches({ value, colors, onChange, label }) {
  const current = (value || "").toLowerCase();
  const isCustom = !colors.some((c) => c.toLowerCase() === current);
  return (
    <div className="settings-swatches" role="radiogroup" aria-label={label}>
      {colors.map((c) => {
        const selected = c.toLowerCase() === current;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c}
            title={c}
            className="settings-swatch"
            style={{ "--swatch": c }}
            onClick={() => onChange(c)}
          >
            {selected && <LuCheck />}
          </button>
        );
      })}
      <label
        className="settings-swatch settings-swatch--custom"
        data-selected={isCustom || undefined}
        style={isCustom ? { "--swatch": value } : undefined}
        title="Custom color"
      >
        <LuPipette />
        <input
          type="color"
          aria-label="Custom accent color"
          value={/^#[0-9a-f]{6}$/i.test(value || "") ? value : "#b05cff"}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

/** In-window confirmation sheet (never window.confirm). Render inside a position:relative root. */
export function ConfirmSheet({ open, icon, title, message, confirmLabel = "OK", danger, onConfirm, onCancel, reduceMotion }) {
  const cancelRef = useRef(null);
  const titleId = useId();
  const msgId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus();
    };
  }, [open]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Tab") {
      // keep focus inside the sheet
      const btns = e.currentTarget.querySelectorAll("button");
      const first = btns[0];
      const last = btns[btns.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const t = { duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] };
  return (
    <AnimatePresence>
      {open && (
        <MotionDiv
          key="backdrop"
          className="settings-sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={t}
          onPointerDown={(e) => e.target === e.currentTarget && onCancel()}
        >
          <MotionDiv
            className="settings-sheet"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={msgId}
            initial={{ opacity: 0, scale: 0.94, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={t}
            onKeyDown={onKeyDown}
          >
            {icon && <div className="settings-sheet-icon">{icon}</div>}
            <h4 id={titleId} className="settings-sheet-title">
              {title}
            </h4>
            <p id={msgId} className="settings-sheet-msg">
              {message}
            </p>
            <div className="settings-sheet-actions">
              <button ref={cancelRef} type="button" className="os-btn" onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                className={`os-btn ${danger ? "settings-btn-danger" : "os-btn--primary"}`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </MotionDiv>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
