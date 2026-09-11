import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  BatteryFull,
  ChevronRight,
  HelpCircle,
  Lock,
  LockOpen,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODES = {
  STANDARD: 'standard',
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
};

const HISTORY_KEY = 'lockcalc-vault-v1';

const KEYPAD = [
  ['(', ')', '%', 'C'],
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['0', '.', '+', '='],
];

// ─── Safe Math Engine (Shunting-Yard + RPN Eval) ─────────────────────────────

/** Normalize display symbols to parser tokens */
function normalizeExpression(raw) {
  return raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\s+/g, '');
}

/** Format numeric result, cleaning floating-point noise */
function formatNumber(value) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 1e12) / 1e12;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(parseFloat(rounded.toPrecision(12)));
}

/** Tokenize expression into numbers and operators */
function tokenize(expr) {
  const tokens = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (/\d/.test(ch) || (ch === '.' && /\d/.test(expr[i + 1] ?? ''))) {
      let num = '';
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === '.')) {
        num += expr[i++];
      }
      if ((num.match(/\./g) || []).length > 1) {
        throw new Error('Invalid number format');
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    if ('+-*/%()'.includes(ch)) {
      tokens.push({ type: 'operator', value: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  return tokens;
}

/** Resolve unary minus vs binary minus */
function toRpn(tokens) {
  const output = [];
  const ops = [];
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
  let prev = null;

  for (const token of tokens) {
    if (token.type === 'number') {
      output.push(token);
      prev = 'number';
      continue;
    }

    const op = token.value;

    if (op === '(') {
      ops.push(token);
      prev = '(';
      continue;
    }

    if (op === ')') {
      while (ops.length && ops[ops.length - 1].value !== '(') {
        output.push(ops.pop());
      }
      if (!ops.length) throw new Error('Mismatched parentheses');
      ops.pop();
      prev = ')';
      continue;
    }

    // Unary minus
    if (op === '-' && (prev === null || prev === '(' || prev === 'operator')) {
      ops.push({ type: 'operator', value: 'u-' });
      prev = 'operator';
      continue;
    }

    if (!prec[op]) throw new Error(`Unknown operator: ${op}`);

    while (
      ops.length &&
      ops[ops.length - 1].value !== '(' &&
      (prec[ops[ops.length - 1].value] ?? 0) >= prec[op]
    ) {
      output.push(ops.pop());
    }

    ops.push(token);
    prev = 'operator';
  }

  while (ops.length) {
    const top = ops.pop();
    if (top.value === '(' || top.value === ')') {
      throw new Error('Mismatched parentheses');
    }
    output.push(top);
  }

  return output;
}

/** Evaluate RPN token list */
function evalRpn(rpn) {
  const stack = [];

  for (const token of rpn) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }

    const op = token.value;

    if (op === 'u-') {
      if (!stack.length) throw new Error('Invalid expression');
      stack.push(-stack.pop());
      continue;
    }

    if (stack.length < 2) throw new Error('Invalid expression');
    const b = stack.pop();
    const a = stack.pop();

    switch (op) {
      case '+':
        stack.push(a + b);
        break;
      case '-':
        stack.push(a - b);
        break;
      case '*':
        stack.push(a * b);
        break;
      case '/':
        if (b === 0) throw new Error('Division by zero');
        stack.push(a / b);
        break;
      case '%':
        if (b === 0) throw new Error('Division by zero');
        stack.push(a % b);
        break;
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  }

  if (stack.length !== 1) throw new Error('Invalid expression');
  const result = stack[0];
  if (!Number.isFinite(result)) throw new Error('Result out of range');
  return result;
}

/** Public API: safely evaluate a math expression string */
function safeEvaluate(rawExpression) {
  const normalized = normalizeExpression(rawExpression);
  if (!normalized) throw new Error('Empty expression');

  const tokens = tokenize(normalized);
  const rpn = toRpn(tokens);
  const value = evalRpn(rpn);
  const formatted = formatNumber(value);
  if (formatted === null) throw new Error('Invalid result');
  return { value, formatted };
}

/** Compare user guess with secret answer (numeric tolerance) */
function answersMatch(guessRaw, secretFormatted) {
  try {
    const { formatted } = safeEvaluate(guessRaw);
    return formatted === secretFormatted;
  } catch {
    return false;
  }
}

// ─── Web Audio Synthesizer ───────────────────────────────────────────────────

function createAudioEngine() {
  let ctx = null;
  let muted = false;

  const ensureCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  const playTone = ({ freq, type, duration, gain = 0.15, attack = 0.01, decay = 0.08 }) => {
    if (muted) return;
    const ac = ensureCtx();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  };

  return {
    setMuted: (m) => {
      muted = m;
    },
    click: () =>
      playTone({ freq: 880, type: 'sine', duration: 0.06, gain: 0.12, attack: 0.005, decay: 0.05 }),
    lock: () => {
      if (muted) return;
      const ac = ensureCtx();
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.35);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    },
    unlock: () => {
      if (muted) return;
      [523, 659, 784, 1047].forEach((freq, i) => {
        setTimeout(() => playTone({ freq, type: 'sine', duration: 0.18, gain: 0.1 }), i * 70);
      });
    },
    failure: () => {
      if (muted) return;
      const ac = ensureCtx();
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const filter = ac.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.65);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.65);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);
      osc.connect(filter);
      filter.connect(g);
      g.connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.72);
    },
  };
}

const audio = createAudioEngine();

// ─── History Vault Helpers ───────────────────────────────────────────────────

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50)));
}

function makeHistoryEntry(expression, answer, unlocked) {
  return {
    id: crypto.randomUUID(),
    expression,
    answer,
    unlocked,
    timestamp: Date.now(),
  };
}

// ─── UI Subcomponents ────────────────────────────────────────────────────────

function KeyButton({ label, onClick, variant = 'default' }) {
  const variants = {
    default: 'lockcalc-key',
    clear: 'lockcalc-key lockcalc-key-clear',
    equals: 'lockcalc-key lockcalc-key-equals',
    operator: 'lockcalc-key lockcalc-key-operator',
    accent: 'lockcalc-key lockcalc-key-accent',
  };

  return (
    <button
      type="button"
      onClick={() => onClick(label)}
      className={`
        font-lcd relative select-none text-base sm:text-lg
        ${variants[variant]}
      `}
    >
      {label}
    </button>
  );
}

/** Underscore answer slots with blinking cursor — matches mockup input row */
function AnswerInput({ value, slotCount = 5 }) {
  const slots = Math.max(slotCount, value.length, 5);

  return (
    <div className="flex items-end justify-center gap-1.5 py-2 sm:gap-2">
      {Array.from({ length: slots }).map((_, i) => (
        <div key={i} className="flex min-w-[18px] flex-col items-center sm:min-w-[22px]">
          <span className="font-lcd h-7 text-xl text-white sm:h-8 sm:text-2xl">
            {value[i] ?? ''}
          </span>
          <span className="font-lcd text-sm text-white/35 sm:text-base">_</span>
        </div>
      ))}
      <span className="font-lcd cursor-blink mb-0.5 text-xl text-cyan-400 sm:text-2xl">|</span>
    </div>
  );
}

function LcdScreen({ mode, expression, lockedExpression, secretAnswer, error, celebrate }) {
  const hintText = lockedExpression
    ? `Hint: What is ${lockedExpression}?`
    : '';

  const answerSlots = secretAnswer ? Math.max(secretAnswer.replace(/[^0-9]/g, '').length, 4) : 5;

  return (
    <div
      className="
        lockcalc-screen relative min-h-[220px] overflow-hidden sm:min-h-[240px]
      "
    >
      {/* Glass sheen */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-transparent" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)',
        }}
      />

      <div className="relative z-10 flex h-full flex-col px-4 py-3 sm:px-5 sm:py-4">
        {/* Status bar: DEG + battery */}
        <div className="mb-2 flex items-center justify-between text-[10px] font-medium tracking-wider text-white/50 sm:text-xs">
          <span>DEG</span>
          <BatteryFull className="h-3.5 w-3.5 text-white/40 sm:h-4 sm:w-4" />
        </div>

        {/* Error inline */}
        {error && (
          <p className="mb-2 text-center text-[10px] text-red-400 sm:text-xs">⚠ {error}</p>
        )}

        {/* Standard mode — typing expression */}
        {mode === MODES.STANDARD && (
          <div className="flex flex-1 flex-col justify-end">
            <p className="font-lcd truncate text-right text-3xl font-semibold text-white sm:text-4xl">
              {expression || '0'}
            </p>
            <p className="mt-2 text-center text-[10px] tracking-[0.2em] text-white/30 sm:text-xs">
              ENTER EXPRESSION
            </p>
          </div>
        )}

        {/* Locked mode — mockup layout */}
        {mode === MODES.LOCKED && (
          <div className="flex flex-1 flex-col">
            <p className="font-lcd text-center text-2xl font-semibold tracking-wide text-white sm:text-3xl">
              {lockedExpression}
            </p>

            <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <div className="flex flex-col items-center gap-1">
              <Lock className="h-5 w-5 text-violet-400 sm:h-6 sm:w-6" strokeWidth={2.5} />
              <p className="font-brand text-sm font-bold tracking-[0.15em] text-violet-400 neon-pulse sm:text-base">
                RESULT LOCKED
              </p>
            </div>

            <p className="mt-2 text-center text-[11px] italic text-white/45 sm:text-xs">{hintText}</p>

            <div className="mt-auto">
              <AnswerInput value={expression} slotCount={answerSlots} />
            </div>
          </div>
        )}

        {/* Unlocked mode — reveal answer */}
        {mode === MODES.UNLOCKED && (
          <div className="flex flex-1 flex-col">
            <p className="font-lcd text-center text-xl text-white/70 sm:text-2xl">{lockedExpression}</p>

            <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <div className="flex flex-col items-center gap-1">
              <LockOpen className="unlock-reveal h-5 w-5 text-emerald-400 sm:h-6 sm:w-6" strokeWidth={2.5} />
              <p
                className={`unlock-reveal font-brand text-sm font-bold tracking-[0.15em] sm:text-base ${
                  celebrate ? 'text-emerald-400 neon-pulse' : 'text-emerald-500'
                }`}
              >
                {celebrate ? 'VAULT UNLOCKED' : 'RESULT REVEALED'}
              </p>
            </div>

            <p className="font-lcd mt-4 text-center text-4xl font-bold text-cyan-300 sm:text-5xl">
              = {secretAnswer}
            </p>

            <p className="mt-auto pt-4 text-center text-[10px] tracking-[0.2em] text-white/30 sm:text-xs">
              PRESS = TO START NEW
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function HelpModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-violet-900/50 bg-gradient-to-br from-[#1a1525] to-[#0d0a14] p-6 shadow-[0_0_40px_rgba(139,92,246,0.15)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-violet-950 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-4 text-xl font-bold text-violet-400">How LockCalc Works</h2>

        <div className="space-y-4 text-sm leading-relaxed text-zinc-300">
          <div className="rounded-xl border border-violet-900/40 bg-black/30 p-4">
            <p className="mb-1 font-semibold text-violet-400">Step 1 — Enter a Problem</p>
            <p>Type any math expression using the keypad or keyboard, then press <kbd className="rounded bg-violet-950 px-1.5 py-0.5 font-mono text-xs">=</kbd>.</p>
          </div>
          <div className="rounded-xl border border-violet-900/40 bg-black/30 p-4">
            <p className="mb-1 font-semibold text-violet-400">Step 2 — The Lock Engages</p>
            <p>LockCalc computes the answer secretly and seals the LCD. Calculate the result in your head!</p>
          </div>
          <div className="rounded-xl border border-violet-900/40 bg-black/30 p-4">
            <p className="mb-1 font-semibold text-violet-400">Step 3 — Unlock Your Answer</p>
            <p>Type your mental math result and press <kbd className="rounded bg-violet-950 px-1.5 py-0.5 font-mono text-xs">=</kbd> again. Correct answers trigger the victory reveal!</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          Supports +, −, ×, ÷, %, parentheses, decimals, and negative numbers. History is saved in your Calculation Vault.
        </p>
      </div>
    </div>
  );
}

function HistoryDrawer({ open, onClose, history, onSelect, onClear }) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-violet-900/50 bg-gradient-to-b from-[#14101c] to-[#0a0810] shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-violet-900/40 p-4">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-bold text-zinc-100">Calculation Vault</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-violet-950">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {history.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">No calculations yet. Lock your first problem!</p>
          ) : (
            <ul className="space-y-3">
              {history.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="w-full rounded-xl border border-violet-900/30 bg-black/30 p-3 text-left transition hover:border-violet-600/50 hover:bg-violet-950/20"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                        {item.unlocked ? (
                          <>
                            <LockOpen className="h-3 w-3" /> Unlocked
                          </>
                        ) : (
                          <>
                            <Lock className="h-3 w-3" /> Locked
                          </>
                        )}
                      </span>
                    </div>
                    <p className="font-lcd truncate text-sm text-zinc-200">{item.expression}</p>
                    {item.unlocked && (
                      <p className="font-lcd mt-1 text-sm text-cyan-400">= {item.answer}</p>
                    )}
                    <ChevronRight className="mt-1 h-4 w-4 text-zinc-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {history.length > 0 && (
          <div className="border-t border-violet-900/40 p-4">
            <button
              type="button"
              onClick={onClear}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-800/60 bg-red-950/40 py-2.5 text-sm text-red-300 transition hover:bg-red-950/70"
            >
              <Trash2 className="h-4 w-4" /> Clear Vault
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode] = useState(MODES.STANDARD);
  const [expression, setExpression] = useState('');
  const [secretAnswer, setSecretAnswer] = useState(null);
  const [lockedExpression, setLockedExpression] = useState('');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [celebrate, setCelebrate] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState(null);

  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const setErrorMsg = useCallback((msg) => {
    setError(msg);
  }, []);

  const clearAll = useCallback(() => {
    setMode(MODES.STANDARD);
    setExpression('');
    setSecretAnswer(null);
    setLockedExpression('');
    setError('');
    setCelebrate(false);
    setActiveHistoryId(null);
  }, []);

  const lockExpression = useCallback(
    (expr) => {
      try {
        const { formatted } = safeEvaluate(expr);
        setMode(MODES.LOCKED);
        setLockedExpression(expr);
        setSecretAnswer(formatted);
        setExpression('');
        setError('');
        setCelebrate(false);

        const entry = makeHistoryEntry(expr, formatted, false);
        setActiveHistoryId(entry.id);
        setHistory((prev) => [entry, ...prev]);
        audio.lock();
      } catch (e) {
        setErrorMsg(e.message || 'Invalid expression');
      }
    },
    [setErrorMsg],
  );

  const attemptUnlock = useCallback(
    (guess) => {
      if (!secretAnswer) return;

      if (answersMatch(guess, secretAnswer)) {
        setMode(MODES.UNLOCKED);
        setExpression('');
        setError('');
        setCelebrate(true);
        audio.unlock();

        setHistory((prev) =>
          prev.map((item) =>
            item.id === activeHistoryId ? { ...item, unlocked: true } : item,
          ),
        );
      } else {
        setError('ACCESS DENIED — Nice try 💀');
        audio.failure();
        setExpression('');
      }
    },
    [secretAnswer, activeHistoryId, setErrorMsg],
  );

  const handleEquals = useCallback(() => {
    if (mode === MODES.STANDARD) {
      if (!expression.trim()) return;
      lockExpression(expression);
      return;
    }

    if (mode === MODES.LOCKED) {
      if (!expression.trim()) {
        setErrorMsg('Enter your answer to unlock');
        return;
      }
      attemptUnlock(expression);
      return;
    }

    if (mode === MODES.UNLOCKED) {
      clearAll();
    }
  }, [mode, expression, lockExpression, attemptUnlock, clearAll, setErrorMsg]);

  const appendToExpression = useCallback(
    (value) => {
      audio.click();
      setError('');

      if (mode === MODES.UNLOCKED) {
        clearAll();
        if (value === 'C') return;
      }

      if (value === 'C') {
        if (mode === MODES.LOCKED) {
          setExpression('');
        } else {
          clearAll();
        }
        return;
      }

      if (value === '+/-') {
        setExpression((prev) => {
          if (!prev) return '-';
          if (prev.startsWith('-')) return prev.slice(1);
          return `-${prev}`;
        });
        return;
      }

      const map = { '×': '×', '÷': '÷', '−': '−', '+': '+', '.': '.', '%': '%' };
      const digitOrOp = map[value] ?? value;

      if (mode === MODES.LOCKED) {
        // In locked mode, only allow numeric input for guessing
        const allowed = '0123456789.-+%()×÷−+*/';
        const char = digitOrOp === '×' ? '×' : digitOrOp === '÷' ? '÷' : digitOrOp === '−' ? '−' : digitOrOp;
        if (!allowed.includes(char) && !/\d/.test(char)) return;
      }

      setExpression((prev) => prev + digitOrOp);
    },
    [mode, clearAll],
  );

  const handleBackspace = useCallback(() => {
    audio.click();
    setError('');
    if (mode === MODES.UNLOCKED) return;
    setExpression((prev) => prev.slice(0, -1));
  }, [mode]);

  const handleKeypad = useCallback(
    (label) => {
      if (label === '=') {
        audio.click();
        handleEquals();
        return;
      }
      if (label === 'C') appendToExpression('C');
      else appendToExpression(label);
    },
    [appendToExpression, handleEquals],
  );

  // Keyboard support
  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key;

      if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleEquals();
        return;
      }
      if (key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
        return;
      }
      if (key === 'Escape') {
        e.preventDefault();
        if (drawerOpen) setDrawerOpen(false);
        else if (helpOpen) setHelpOpen(false);
        else clearAll();
        return;
      }

      const map = {
        '+': '+',
        '-': '−',
        '*': '×',
        '/': '÷',
        '%': '%',
        '(': '(',
        ')': ')',
        '.': '.',
      };

      if (map[key]) {
        e.preventDefault();
        appendToExpression(map[key]);
        return;
      }

      if (/^\d$/.test(key)) {
        e.preventDefault();
        appendToExpression(key);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleEquals, handleBackspace, appendToExpression, clearAll, drawerOpen, helpOpen]);

  const loadFromHistory = useCallback((item) => {
    audio.click();
    setDrawerOpen(false);
    setError('');
    setCelebrate(false);
    setActiveHistoryId(item.id);
    setLockedExpression(item.expression);
    setSecretAnswer(item.answer);

    if (item.unlocked) {
      setMode(MODES.UNLOCKED);
      setExpression('');
    } else {
      setMode(MODES.LOCKED);
      setExpression('');
    }
  }, []);

  return (
    <div className="lockcalc-page relative flex min-h-screen items-center justify-center overflow-hidden px-3 py-8 sm:px-6">

      <div className="relative w-full max-w-[380px]">
        {/* Device chassis with purple side neon strips */}
        <div className="lockcalc-device relative p-4 sm:p-6">
          <div
            className="
              relative px-1 pb-1 pt-1 sm:px-2 sm:pb-2 sm:pt-2
            "
          >
            {/* Utility controls — subtle top-right */}
            <div className="absolute right-5 top-5 flex items-center gap-1 sm:right-6 sm:top-6">
              <button
                type="button"
                onClick={() => {
                  audio.click();
                  setMuted((m) => !m);
                }}
                className="rounded-lg p-1.5 text-zinc-700 transition hover:bg-black/5 hover:text-black"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  audio.click();
                  setHelpOpen(true);
                }}
                className="rounded-lg p-1.5 text-zinc-700 transition hover:bg-black/5 hover:text-black"
                title="Help"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  audio.click();
                  setDrawerOpen(true);
                }}
                className="rounded-lg p-1.5 text-zinc-700 transition hover:bg-black/5 hover:text-black"
                title="History Vault"
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Brand header — centered like mockup */}
            <header className="mb-5 text-center sm:mb-6">
              <h1 className="font-brand text-2xl font-bold tracking-wide text-black sm:text-[1.65rem]">
                <span>Lock</span>
                <span className="rounded-md bg-[#ffd91f] px-1">Calc</span>
              </h1>
              <p className="mt-1 text-[9px] font-medium tracking-[0.35em] text-zinc-800 sm:text-[10px]">
                THINK · SOLVE · UNLOCK
              </p>
            </header>

            {/* LCD display */}
            <LcdScreen
              mode={mode}
              expression={expression}
              lockedExpression={lockedExpression}
              secretAnswer={secretAnswer}
              error={error}
              celebrate={celebrate}
            />

            {/* Keypad — exact 4×5 mockup grid */}
            <div className="mt-4 grid grid-cols-4 gap-2 sm:mt-5 sm:gap-2.5">
              {KEYPAD.flatMap((row) =>
                row.map((key) => (
                  <KeyButton
                    key={key}
                    label={key}
                    onClick={handleKeypad}
                    variant={
                      key === 'C'
                        ? 'clear'
                        : key === '='
                          ? 'equals'
                          : ['÷', '×', '−'].includes(key)
                            ? 'operator'
                            : key === '+'
                              ? 'accent'
                              : 'default'
                    }
                  />
                )),
              )}
            </div>

            {/* Footer tagline */}
            <div className="mt-5 flex items-center gap-3 sm:mt-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
              <p className="whitespace-nowrap text-[8px] font-medium tracking-[0.25em] text-zinc-600 sm:text-[9px]">
                MORE THAN A CALCULATOR
              </p>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
            </div>
          </div>
        </div>
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <HistoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        history={history}
        onSelect={loadFromHistory}
        onClear={() => {
          audio.click();
          setHistory([]);
          setDrawerOpen(false);
        }}
      />
    </div>
  );
}
