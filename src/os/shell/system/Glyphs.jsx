// Custom monochrome glyphs for the menu bar (all draw with currentColor).

/** SherlockOS mark: a deerstalker hat. */
export function SherlockMark({ size = 16, ...rest }) {
  return (
    <svg
      width={size * 1.125}
      height={size}
      viewBox="0 0 18 16"
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      <circle cx="9" cy="2.1" r="1.15" />
      <path d="M3.6 10.2C3.6 6 6 3.2 9 3.2s5.4 2.8 5.4 7c-1.7-.55-3.5-.82-5.4-.82s-3.7.27-5.4.82z" />
      <path d="M2.9 10.9c-1.3.5-2.2 1.5-2.6 2.9 1.9-.9 3.9-1.4 5.9-1.55l-.5-2.1c-1 .15-1.9.4-2.8.75z" />
      <path d="M15.1 10.9c1.3.5 2.2 1.5 2.6 2.9-1.9-.9-3.9-1.4-5.9-1.55l.5-2.1c1 .15 1.9.4 2.8.75z" />
      <path d="M6.9 10.05a14 14 0 0 1 4.2 0l-.45 2.15a11 11 0 0 0-3.3 0z" opacity=".55" />
    </svg>
  );
}

export function BatteryGlyph({ level = 1, charging = false }) {
  const low = level <= 0.2 && !charging;
  const w = Math.max(1.5, 19 * Math.min(1, Math.max(0, level)));
  return (
    <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden="true">
      <rect x=".6" y=".6" width="22.8" height="11.8" rx="3.4" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.1" />
      <path d="M24.8 4.3v4.4c.95-.3 1.6-1.15 1.6-2.2s-.65-1.9-1.6-2.2z" fill="currentColor" fillOpacity=".45" />
      <rect x="2.5" y="2.5" width={w} height="8" rx="1.9" fill={low ? "var(--danger)" : charging ? "var(--success)" : "currentColor"} />
      {charging && (
        <path
          d="M13.2 1.6 8.9 7.1h2.7l-.9 4.3 4.4-5.6h-2.7z"
          fill="var(--text)"
          stroke="var(--bg-window)"
          strokeWidth=".7"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** Two stacked switches, like the macOS Control Center status item. */
export function ControlCenterGlyph({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.1" y="2.1" width="13.8" height="5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.6" cy="4.6" r="1.25" fill="currentColor" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M3.5 8.9h9a2.5 2.5 0 0 1 0 5h-9a2.5 2.5 0 0 1 0-5zm.9 1.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"
      />
    </svg>
  );
}
