// Calculator — a macOS-style basic calculator with immediate-execution semantics.
import { memo, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { useWindows } from "../../os/windowStore";
import { useUI, contextMenu, notify } from "../../os/ui";
import { reduce, initialState, displayText, copyText, canClearEntry, armedOp } from "./engine";
import "./calculator.css";

const OP_LABEL = { "/": "Divide", "*": "Multiply", "-": "Subtract", "+": "Add" };

// id, label, kind, action, aria-label
const KEYS = [
  { id: "clear", kind: "fn" },
  { id: "negate", label: "±", kind: "fn", action: { type: "negate" }, aria: "Plus minus" },
  { id: "percent", label: "%", kind: "fn", action: { type: "percent" }, aria: "Percent" },
  { id: "/", label: "÷", kind: "op", action: { type: "op", op: "/" }, aria: OP_LABEL["/"] },
  ...digitRow(["7", "8", "9"]),
  { id: "*", label: "×", kind: "op", action: { type: "op", op: "*" }, aria: OP_LABEL["*"] },
  ...digitRow(["4", "5", "6"]),
  { id: "-", label: "−", kind: "op", action: { type: "op", op: "-" }, aria: OP_LABEL["-"] },
  ...digitRow(["1", "2", "3"]),
  { id: "+", label: "+", kind: "op", action: { type: "op", op: "+" }, aria: OP_LABEL["+"] },
  { id: "0", label: "0", kind: "num", wide: true, action: { type: "digit", digit: "0" } },
  { id: ".", label: ".", kind: "num", action: { type: "dot" }, aria: "Decimal point" },
  { id: "=", label: "=", kind: "op", action: { type: "equals" }, aria: "Equals" },
];

function digitRow(digits) {
  return digits.map((d) => ({ id: d, label: d, kind: "num", action: { type: "digit", digit: d } }));
}

/** Map a keyboard event to a key id from KEYS (or "backspace" / "allClear"). */
function keyToId(e) {
  const k = e.key;
  if (k >= "0" && k <= "9" && k.length === 1) return k;
  switch (k) {
    case ".":
    case ",":
      return ".";
    case "+":
      return "+";
    case "-":
    case "−":
      return "-";
    case "*":
    case "x":
    case "X":
    case "×":
      return "*";
    case "/":
    case "÷":
      return "/";
    case "%":
      return "percent";
    case "=":
    case "Enter":
      return "=";
    case "Backspace":
      return "backspace";
    case "Escape":
      return "allClear";
    case "Delete":
    case "c":
    case "C":
      return "clear";
    default:
      return null;
  }
}

const Key = memo(function Key({ k, label, armed, pressed, onPress }) {
  return (
    <button
      type="button"
      className={`calculator-key calculator-key--${k.kind}${k.wide ? " calculator-key--wide" : ""}`}
      data-armed={armed || undefined}
      data-pressed={pressed || undefined}
      aria-label={k.aria || label}
      aria-pressed={k.kind === "op" && k.id !== "=" ? armed : undefined}
      onClick={() => onPress(k.id)}
    >
      <span>{label}</span>
    </button>
  );
});

/** Right-aligned number that scales down (transform only) so it always fits. */
function Display({ text, error, onCopy }) {
  const boxRef = useRef(null);
  const textRef = useRef(null);

  const fit = useCallback(() => {
    const box = boxRef.current;
    const el = textRef.current;
    if (!box || !el) return;
    const style = getComputedStyle(box);
    const avail = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const need = el.offsetWidth;
    const scale = need > avail && need > 0 ? Math.max(0.2, avail / need) : 1;
    el.style.transform = scale === 1 ? "" : `scale(${scale})`;
  }, []);

  useLayoutEffect(fit, [fit, text]);
  useEffect(() => {
    const ro = new ResizeObserver(fit);
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <div
      ref={boxRef}
      className="calculator-display"
      data-window-drag
      onContextMenu={(e) => contextMenu(e, [{ label: "Copy", shortcut: "Ctrl+C", onClick: onCopy }])}
    >
      <output
        ref={textRef}
        className={`calculator-display-text os-selectable${error ? " calculator-display-text--error" : ""}`}
        aria-live="polite"
      >
        {text}
      </output>
    </div>
  );
}

export default function Calculator({ windowId }) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [pressed, setPressed] = useState(null);
  const active = useWindows((s) => s.activeId === windowId);
  const stateRef = useRef(state);
  const pressTimer = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const press = useCallback((id) => {
    if (id === "backspace") return dispatch({ type: "backspace" });
    if (id === "allClear") return dispatch({ type: "allClear" });
    if (id === "clear") return dispatch({ type: "clear" });
    const key = KEYS.find((k) => k.id === id);
    if (key?.action) dispatch(key.action);
  }, []);

  const copy = useCallback(async () => {
    const text = copyText(stateRef.current);
    try {
      await navigator.clipboard.writeText(text);
      notify({ title: "Calculator", body: `Copied ${text}`, appId: "calculator", duration: 1800 });
    } catch {
      notify({ title: "Calculator", body: "Couldn't access the clipboard.", appId: "calculator" });
    }
  }, []);

  // Keyboard support while this window is the active one.
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e) => {
      const ui = useUI.getState();
      if (ui.overlay || ui.locked || ui.contextMenu) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "c" || e.key === "C")) {
        if (String(window.getSelection?.() || "").length === 0) {
          e.preventDefault();
          copy();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const id = keyToId(e);
      if (!id) return;
      e.preventDefault(); // also stops Enter from "clicking" a focused key
      press(id);
      const visual = id === "allClear" ? "clear" : id;
      setPressed(visual);
      clearTimeout(pressTimer.current);
      pressTimer.current = setTimeout(() => setPressed(null), 110);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, press, copy]);

  const armed = armedOp(state);
  const clearLabel = canClearEntry(state) ? "C" : "AC";

  return (
    <div className="calculator">
      <Display text={displayText(state)} error={state.error} onCopy={copy} />
      <div className="calculator-keys" role="group" aria-label="Calculator keys">
        {KEYS.map((k) => (
          <Key
            key={k.id}
            k={k}
            label={k.id === "clear" ? clearLabel : k.label}
            armed={armed === k.id}
            pressed={pressed === k.id}
            onPress={press}
          />
        ))}
      </div>
    </div>
  );
}
