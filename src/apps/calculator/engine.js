// Immediate-execution calculator engine (the way the macOS basic calculator behaves).
// Pure reducer + formatting helpers. No eval / Function anywhere.

const MAX_DIGITS = 9;

export const initialState = {
  input: null, // string while the user is typing a number, else null
  value: 0, // number shown when `input` is null
  acc: null, // left operand of the pending operation
  op: null, // pending operator: "+" | "-" | "*" | "/"
  hasOperand: false, // a right operand was supplied since the operator was pressed
  lastOp: null, // for repeated "="
  lastOperand: null,
  error: false,
};

const errorState = { ...initialState, error: true, value: NaN };

function compute(a, op, b) {
  let r;
  switch (op) {
    case "+":
      r = a + b;
      break;
    case "-":
      r = a - b;
      break;
    case "*":
      r = a * b;
      break;
    case "/":
      r = b === 0 ? NaN : a / b;
      break;
    default:
      r = b;
  }
  if (!Number.isFinite(r)) return NaN;
  // Trim binary floating-point noise (0.1 + 0.2 -> 0.3).
  return Number(r.toPrecision(15));
}

const current = (s) => (s.input != null ? parseFloat(s.input) : s.value);
const digitCount = (str) => str.replace(/[^0-9]/g, "").length;

export function reduce(state, action) {
  switch (action.type) {
    case "digit": {
      const s = state.error ? initialState : state;
      const d = action.digit;
      let input;
      if (s.input == null) input = d;
      else if (s.input === "0") input = d;
      else if (s.input === "-0") input = "-" + d;
      else if (digitCount(s.input) >= MAX_DIGITS) return s;
      else input = s.input + d;
      return { ...s, input, hasOperand: s.op ? true : s.hasOperand, lastOp: s.op ? s.lastOp : null };
    }
    case "dot": {
      const s = state.error ? initialState : state;
      let input;
      if (s.input == null) input = "0.";
      else if (s.input.includes(".") || digitCount(s.input) >= MAX_DIGITS) return s;
      else input = s.input + ".";
      return { ...s, input, hasOperand: s.op ? true : s.hasOperand, lastOp: s.op ? s.lastOp : null };
    }
    case "op": {
      if (state.error) return state;
      const cur = current(state);
      let acc = cur;
      if (state.op) {
        if (!state.hasOperand) return { ...state, op: action.op };
        acc = compute(state.acc, state.op, cur);
        if (Number.isNaN(acc)) return errorState;
      }
      return {
        ...state,
        input: null,
        value: acc,
        acc,
        op: action.op,
        hasOperand: false,
        lastOp: null,
        lastOperand: null,
      };
    }
    case "equals": {
      if (state.error) return state;
      const cur = current(state);
      let result = cur;
      let { lastOp, lastOperand } = state;
      if (state.op) {
        result = compute(state.acc, state.op, cur);
        lastOp = state.op;
        lastOperand = cur;
      } else if (lastOp) {
        result = compute(cur, lastOp, lastOperand);
      }
      if (Number.isNaN(result)) return errorState;
      return {
        ...initialState,
        value: result,
        lastOp,
        lastOperand,
      };
    }
    case "percent": {
      if (state.error) return state;
      const cur = current(state);
      const additive = state.op === "+" || state.op === "-";
      const value = Number(((additive ? (state.acc * cur) / 100 : cur / 100)).toPrecision(15));
      if (!Number.isFinite(value)) return errorState;
      return { ...state, input: null, value, hasOperand: state.op ? true : state.hasOperand };
    }
    case "negate": {
      if (state.error) return state;
      if (state.input != null) {
        const input = state.input.startsWith("-") ? state.input.slice(1) : "-" + state.input;
        return { ...state, input };
      }
      if (state.value === 0 || (state.op && !state.hasOperand)) {
        return { ...state, input: "-0", hasOperand: state.op ? true : state.hasOperand };
      }
      return { ...state, value: -state.value };
    }
    case "backspace": {
      if (state.error) return initialState;
      if (state.input == null) return state;
      let input = state.input.slice(0, -1);
      if (input === "" || input === "-") input = "0";
      return { ...state, input };
    }
    case "clear": {
      // "C" clears the current entry and keeps the pending operation; "AC" clears everything.
      if (state.error || !canClearEntry(state)) return initialState;
      return { ...state, input: null, value: 0, hasOperand: false };
    }
    case "allClear":
      return initialState;
    default:
      return state;
  }
}

/** True when the clear key should read "C" (clear entry) instead of "AC". */
export const canClearEntry = (s) => !s.error && (s.input != null || s.value !== 0);

/** Operator currently "armed" (highlighted): pressed, and no right operand typed yet. */
export const armedOp = (s) => (s.op && !s.hasOperand ? s.op : null);

const group = (intPart) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function formatExponent(n) {
  let [mantissa, exp] = n.toExponential(6).split("e");
  if (mantissa.includes(".")) mantissa = mantissa.replace(/0+$/, "").replace(/\.$/, "");
  return `${mantissa}e${exp.replace("+", "")}`;
}

/** Format a number: thousands separators, at most 9 significant digits, exponent beyond that. */
export function formatNumber(n) {
  if (!Number.isFinite(n)) return "Not a number";
  if (n === 0) return "0";
  const rounded = Number(n.toPrecision(MAX_DIGITS));
  const abs = Math.abs(rounded);
  if (abs >= 1e9 || abs < 1e-6) return formatExponent(rounded);
  const intDigits = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 0;
  let fixed = abs.toFixed(Math.max(0, MAX_DIGITS - intDigits));
  if (fixed.includes(".")) fixed = fixed.replace(/0+$/, "").replace(/\.$/, "");
  const [int, frac] = fixed.split(".");
  return (rounded < 0 ? "-" : "") + group(int) + (frac ? "." + frac : "");
}

function formatInput(input) {
  const neg = input.startsWith("-");
  const body = neg ? input.slice(1) : input;
  const dot = body.indexOf(".");
  const int = dot === -1 ? body : body.slice(0, dot);
  const rest = dot === -1 ? "" : body.slice(dot);
  return (neg ? "-" : "") + group(int) + rest;
}

/** Text for the display. */
export function displayText(s) {
  if (s.error) return "Not a number";
  return s.input != null ? formatInput(s.input) : formatNumber(s.value);
}

/** Plain value for the clipboard (no separators). */
export function copyText(s) {
  return displayText(s).replace(/,/g, "");
}
