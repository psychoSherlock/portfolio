// Tiny arithmetic evaluator for Spotlight (recursive descent, no eval).
// Grammar:
//   expr    := term (("+" | "-") term)*
//   term    := unary (("*" | "/" | "%") unary | implicit-mult)*
//   unary   := ("+" | "-") unary | power
//   power   := postfix ("^" unary)?
//   postfix := primary ("!" | "%")*        (% is "percent" when no operand follows)
//   primary := number | const | func "(" expr ("," expr)* ")" | "(" expr ")"

const FUNCS = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };

function tokenize(src) {
  const s = src
    .replace(/[×✕]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/π/g, " pi ")
    .replace(/\*\*/g, "^");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    const num = /^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) {
      out.push({ t: "num", v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[a-z][a-z0-9]*/i.exec(s.slice(i));
    if (id) {
      out.push({ t: "id", v: id[0].toLowerCase() });
      i += id[0].length;
      continue;
    }
    if ("+-*/%^(),!".includes(c)) {
      out.push({ t: c });
      i++;
      continue;
    }
    throw new Error("bad char");
  }
  return out;
}

function factorial(n) {
  if (n < 0 || !Number.isInteger(n) || n > 170) throw new Error("bad factorial");
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

function parse(tokens) {
  let pos = 0;
  let ops = 0;
  const peek = () => tokens[pos];
  const eat = (t) => {
    if (tokens[pos]?.t !== t) throw new Error(`expected ${t}`);
    return tokens[pos++];
  };
  const startsOperand = (tok) => !!tok && (tok.t === "num" || tok.t === "id" || tok.t === "(");

  function expr() {
    let v = term();
    while (peek() && (peek().t === "+" || peek().t === "-")) {
      const op = tokens[pos++].t;
      const r = term();
      v = op === "+" ? v + r : v - r;
      ops++;
    }
    return v;
  }

  function term() {
    let v = unary();
    for (;;) {
      const tok = peek();
      if (!tok) break;
      if (tok.t === "*" || tok.t === "/") {
        pos++;
        const r = unary();
        v = tok.t === "*" ? v * r : v / r;
        ops++;
      } else if (tok.t === "%") {
        pos++;
        const r = unary();
        v = v % r;
        ops++;
      } else if (tok.t === "(" || tok.t === "id") {
        // implicit multiplication: 2(3+4), 2pi
        v *= unary();
        ops++;
      } else break;
    }
    return v;
  }

  function unary() {
    const tok = peek();
    if (tok?.t === "-") {
      pos++;
      return -unary();
    }
    if (tok?.t === "+") {
      pos++;
      return unary();
    }
    return power();
  }

  function power() {
    const base = postfix();
    if (peek()?.t === "^") {
      pos++;
      ops++;
      return Math.pow(base, unary()); // right associative
    }
    return base;
  }

  function postfix() {
    let v = primary();
    for (;;) {
      const tok = peek();
      if (tok?.t === "!") {
        pos++;
        v = factorial(v);
        ops++;
      } else if (tok?.t === "%" && !startsOperand(tokens[pos + 1])) {
        pos++;
        v /= 100;
        ops++;
      } else break;
    }
    return v;
  }

  function primary() {
    const tok = peek();
    if (!tok) throw new Error("unexpected end");
    if (tok.t === "num") {
      pos++;
      return tok.v;
    }
    if (tok.t === "(") {
      pos++;
      const v = expr();
      eat(")");
      return v;
    }
    if (tok.t === "id") {
      pos++;
      if (Object.hasOwn(FUNCS, tok.v) && peek()?.t === "(") {
        pos++;
        const args = [expr()];
        while (peek()?.t === ",") {
          pos++;
          args.push(expr());
        }
        eat(")");
        ops++;
        return FUNCS[tok.v](...args);
      }
      if (Object.hasOwn(CONSTS, tok.v)) {
        ops++;
        return CONSTS[tok.v];
      }
      throw new Error("unknown name");
    }
    throw new Error("unexpected token");
  }

  const value = expr();
  if (pos !== tokens.length) throw new Error("trailing input");
  return { value, ops };
}

/** Format a number the way a calculator would (no float noise, grouped digits). */
export function formatNumber(n) {
  if (!Number.isFinite(n)) return String(n);
  const clean = Number(n.toPrecision(12));
  const abs = Math.abs(clean);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-7)) return clean.toExponential(6).replace(/\.?0+e/, "e");
  return clean.toLocaleString("en-US", { maximumFractionDigits: 10 });
}

/**
 * Evaluate a math expression. Returns { value, text } or null when the input
 * is not a (non-trivial) arithmetic expression.
 */
export function evaluate(input) {
  const src = String(input || "").trim().replace(/=$/, "");
  if (!src || src.length > 200 || !/[\d)a-zπ]/i.test(src)) return null;
  try {
    const tokens = tokenize(src);
    if (tokens.length < 2) return null;
    const { value, ops } = parse(tokens);
    if (ops === 0 || typeof value !== "number" || !Number.isFinite(value)) return null;
    const clean = Number(value.toPrecision(12));
    return { value: clean, text: formatNumber(clean) };
  } catch {
    return null;
  }
}
