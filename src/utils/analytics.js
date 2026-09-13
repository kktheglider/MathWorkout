/*
 * analytics.js — pure, dependency-free analysis helpers for Math Workout.
 *
 * Reads (never writes) the existing localStorage history schema:
 *   key:   mathWorkout_{mode}_{difficulty}_{questions}
 *   value: JSON array of session records
 *          { date, mode, difficulty, questions, totalTime, isTimeMode, details: [...] }
 *
 * IMPORTANT: `isCorrect` in the stored details is always true (the game only
 * advances once the answer is right). First-attempt correctness is therefore
 * `attempts.length === 1`.
 */

const HISTORY_PREFIX = 'mathWorkout_';
const NON_HISTORY_KEYS = new Set(['mathWorkoutSettings', 'theme']);

/* ------------------------------------------------------------------ */
/* Small numeric helpers                                              */
/* ------------------------------------------------------------------ */

export function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const nums = arr.filter((n) => typeof n === 'number' && Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (nums.length === 0) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  const nums = arr.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Trailing rolling median: element i = median of the window ending at i. */
export function rollingMedian(arr, window) {
  if (!arr || arr.length === 0) return [];
  const w = Math.max(1, window | 0);
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = median(arr.slice(Math.max(0, i - w + 1), i + 1));
  }
  return out;
}

/** Trailing rolling mean (used for rates like first-attempt %). */
export function rollingMean(arr, window) {
  if (!arr || arr.length === 0) return [];
  const w = Math.max(1, window | 0);
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = mean(arr.slice(Math.max(0, i - w + 1), i + 1));
  }
  return out;
}

function safePct(part, whole) {
  if (!whole) return 0;
  const v = (part / whole) * 100;
  return Number.isFinite(v) ? v : 0;
}

function digits(n) {
  const s = String(Math.abs(Math.trunc(n)));
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const d = s.charCodeAt(i) - 48;
    if (d >= 0 && d <= 9) out.push(d);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Carry load                                                          */
/* ------------------------------------------------------------------ */

/**
 * Number of digit-pair products di*dj that are >= 10, across every digit of a
 * paired with every digit of b. This is the difficulty proxy the whole
 * analysis is calibrated on — do not change the definition.
 */
export function carryLoad(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return 0;
  const da = digits(a);
  const db = digits(b);
  let count = 0;
  for (let i = 0; i < da.length; i++) {
    for (let j = 0; j < db.length; j++) {
      if (da[i] * db[j] >= 10) count++;
    }
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Question parsing                                                    */
/* ------------------------------------------------------------------ */

const BINARY_RE = /^(\d+)\s*([×xX*+\-−÷/])\s*(\d+)$/;
const ROOT_RE = /^([√∛])\s*(\d+)$/;
const SQUARE_RE = /^(\d+)\s*²$/;

const OPERATOR_CANON = {
  '×': '×', x: '×', X: '×', '*': '×',
  '+': '+',
  '-': '-', '−': '-',
  '÷': '÷', '/': '÷',
};

function cleanText(raw) {
  if (typeof raw !== 'string') return '';
  // Details may contain markup (Results.jsx renders questionText as HTML).
  return raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * parseQuestion(detail) -> { a, b, operator, expected, firstAttempt, timeTaken, ok, text }
 * operator is null when the question text is not recognised.
 */
export function parseQuestion(detail) {
  const out = {
    a: null,
    b: null,
    operator: null,
    expected: null,
    firstAttempt: null,
    timeTaken: 0,
    ok: false,
    text: '',
  };
  if (!detail || typeof detail !== 'object') return out;

  const text = cleanText(detail.questionText);
  out.text = text;

  const t = typeof detail.timeTaken === 'number' && Number.isFinite(detail.timeTaken) && detail.timeTaken >= 0
    ? detail.timeTaken
    : 0;
  out.timeTaken = t;

  const attempts = Array.isArray(detail.attempts) ? detail.attempts : null;
  out.ok = !!attempts && attempts.length === 1;

  const rawFirst = attempts && attempts.length > 0 ? attempts[0] : detail.userAnswer;
  const firstNum = Number(rawFirst);
  out.firstAttempt = Number.isFinite(firstNum) ? firstNum : null;

  const expNum = Number(detail.expected);
  out.expected = Number.isFinite(expNum) ? expNum : null;

  let m = BINARY_RE.exec(text);
  if (m) {
    out.a = Number(m[1]);
    out.b = Number(m[3]);
    out.operator = OPERATOR_CANON[m[2]] || null;
    return out;
  }

  m = ROOT_RE.exec(text);
  if (m) {
    out.operator = m[1]; // '√' or '∛'
    out.a = Number(m[2]);
    return out;
  }

  m = SQUARE_RE.exec(text);
  if (m) {
    out.operator = '²';
    out.a = Number(m[1]);
    return out;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Storage loading                                                     */
/* ------------------------------------------------------------------ */

function splitKey(key) {
  // mathWorkout_{mode}_{difficulty}_{questions}
  // mode may itself contain spaces (never underscores); questions may be
  // "10" | "all" | "time_1", so parse from the right with care.
  const body = key.slice(HISTORY_PREFIX.length);
  const parts = body.split('_');
  if (parts.length < 3) return null;
  let questions;
  let rest;
  if (parts.length >= 4 && parts[parts.length - 2] === 'time') {
    questions = `time_${parts[parts.length - 1]}`;
    rest = parts.slice(0, parts.length - 2);
  } else {
    questions = parts[parts.length - 1];
    rest = parts.slice(0, parts.length - 1);
  }
  if (rest.length < 2) return null;
  const difficulty = rest[rest.length - 1];
  const mode = rest.slice(0, rest.length - 1).join('_');
  if (!mode || !difficulty) return null;
  return { mode, difficulty, questions };
}

function isValidSession(s) {
  return !!s && typeof s === 'object' && Array.isArray(s.details);
}

/**
 * Reads every history key out of localStorage.
 * Returns [{ key, mode, difficulty, questions, sessions }] — defensive: any
 * malformed key or record is skipped rather than thrown.
 */
export function loadAllSessions(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return [];

  let keys = [];
  try {
    keys = Object.keys(store);
  } catch {
    return [];
  }

  const groups = [];
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    if (!key.startsWith(HISTORY_PREFIX)) continue;
    if (NON_HISTORY_KEYS.has(key)) continue;

    const meta = splitKey(key);
    if (!meta) continue;

    let parsed;
    try {
      const raw = store.getItem(key);
      if (typeof raw !== 'string' || raw.length === 0) continue;
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;

    const sessions = parsed.filter(isValidSession);
    if (sessions.length === 0) continue;

    groups.push({ key, mode: meta.mode, difficulty: meta.difficulty, questions: meta.questions, sessions });
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/* Error anatomy helpers                                               */
/* ------------------------------------------------------------------ */

const COLUMN_NAMES = ['Units', 'Tens', 'Hundreds', 'Thousands', 'Ten-thousands', 'Hundred-thousands'];

function magnitudeBucket(diff) {
  if (diff < 10) return '<10';
  if (diff < 100) return '10-99';
  if (diff < 1000) return '100-999';
  if (diff < 10000) return '1k-10k';
  return '>10k';
}

/* ------------------------------------------------------------------ */
/* Main analysis                                                       */
/* ------------------------------------------------------------------ */

const EMPTY = () => ({
  ok: false,
  totals: {
    sessions: 0, questions: 0, hours: 0, days: 0,
    firstDate: null, lastDate: null, spanDays: 0, totalTimeMs: 0,
  },
  perSession: [],
  rolling: { medianSec: [], firstRate: [] },
  adjusted: { available: false, coverage: 0, series: [] },
  improvement: null,
  quartiles: [],
  carry: [],
  position: [],
  errors: null,
  attempts: { one: 0, two: 0, three: 0, fourPlus: 0, total: 0 },
  perDay: [],
  operands: { available: false, left: [], right: [] },
  mostMissed: [],
  slowestRecent: [],
  fastestSet: null,
  setSize: 0,
  binaryCoverage: 0,
});

/**
 * analyseSessions(sessions) — sessions is a flat array of raw session records
 * (already merged across whatever storage keys are in scope). Everything is
 * computed in a handful of passes so a 1.2 MB history stays fast.
 */
export function analyseSessions(sessions) {
  const result = EMPTY();
  if (!Array.isArray(sessions) || sessions.length === 0) return result;

  // Chronological order — storage is append-order but be safe.
  const ordered = sessions
    .filter(isValidSession)
    .slice()
    .sort((a, b) => (Number(a.date) || 0) - (Number(b.date) || 0));

  if (ordered.length === 0) return result;

  /* ---------- Pass 1: parse every question once ---------- */
  const sessionQ = []; // array of arrays of parsed questions
  const allQ = [];
  let binaryCount = 0;

  for (let si = 0; si < ordered.length; si++) {
    const s = ordered[si];
    const list = [];
    for (let qi = 0; qi < s.details.length; qi++) {
      const p = parseQuestion(s.details[qi]);
      p.sessionIndex = si;
      p.position = qi + 1;
      p.date = Number(s.date) || 0;
      p.hasPair = p.a !== null && p.b !== null && Number.isFinite(p.a) && Number.isFinite(p.b);
      p.carry = p.hasPair ? carryLoad(p.a, p.b) : null;
      p.attemptCount = Array.isArray(s.details[qi].attempts) ? s.details[qi].attempts.length : 1;
      if (p.hasPair) binaryCount++;
      list.push(p);
      allQ.push(p);
    }
    sessionQ.push(list);
  }

  const totalQuestions = allQ.length;
  if (totalQuestions === 0) return result;

  result.ok = true;
  result.binaryCoverage = safePct(binaryCount, totalQuestions) / 100;

  /* ---------- Totals ---------- */
  let totalTimeMs = 0;
  const dayKeys = new Set();
  for (const s of ordered) {
    const t = Number(s.totalTime);
    totalTimeMs += Number.isFinite(t) && t > 0 ? t : 0;
    const d = new Date(Number(s.date) || 0);
    dayKeys.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
  }
  const firstDate = Number(ordered[0].date) || 0;
  const lastDate = Number(ordered[ordered.length - 1].date) || 0;
  result.totals = {
    sessions: ordered.length,
    questions: totalQuestions,
    hours: totalTimeMs / 3600000,
    days: dayKeys.size,
    firstDate,
    lastDate,
    spanDays: lastDate > firstDate ? Math.round((lastDate - firstDate) / 86400000) : 0,
    totalTimeMs,
  };

  // Modal set size (used to decide whether the within-set section makes sense)
  const sizeCounts = new Map();
  for (const list of sessionQ) sizeCounts.set(list.length, (sizeCounts.get(list.length) || 0) + 1);
  let setSize = 0;
  let bestCount = -1;
  for (const [size, c] of sizeCounts) {
    if (c > bestCount) { bestCount = c; setSize = size; }
  }
  result.setSize = setSize;

  /* ---------- Carry buckets (all-time medians) ---------- */
  const carryTimes = new Map(); // carry -> [ms]
  const carryMiss = new Map();  // carry -> misses
  const carryN = new Map();
  for (const q of allQ) {
    if (q.carry === null) continue;
    if (!carryTimes.has(q.carry)) { carryTimes.set(q.carry, []); carryMiss.set(q.carry, 0); carryN.set(q.carry, 0); }
    carryTimes.get(q.carry).push(q.timeTaken);
    carryN.set(q.carry, carryN.get(q.carry) + 1);
    if (!q.ok) carryMiss.set(q.carry, carryMiss.get(q.carry) + 1);
  }
  const carryMedian = new Map();
  for (const [c, arr] of carryTimes) carryMedian.set(c, median(arr));

  result.carry = [...carryTimes.keys()]
    .sort((a, b) => a - b)
    .map((c) => ({
      carry: c,
      n: carryN.get(c),
      medianSec: carryMedian.get(c) / 1000,
      errPct: safePct(carryMiss.get(c), carryN.get(c)),
    }))
    .filter((r) => r.n >= 10);

  /* ---------- Difficulty-adjusted ratio per question ---------- */
  const adjustedAvailable = binaryCount >= totalQuestions * 0.6;
  if (adjustedAvailable) {
    for (const q of allQ) {
      const bm = q.carry === null ? 0 : carryMedian.get(q.carry);
      q.ratio = bm > 0 ? q.timeTaken / bm : null;
    }
  } else {
    for (const q of allQ) q.ratio = null;
  }

  /* ---------- Per-session series ---------- */
  const perSession = [];
  for (let si = 0; si < ordered.length; si++) {
    const list = sessionQ[si];
    const times = list.map((q) => q.timeTaken);
    const firstAttempt = list.reduce((acc, q) => acc + (q.ok ? 1 : 0), 0);
    const carries = list.filter((q) => q.carry !== null).map((q) => q.carry);
    const ratios = list.map((q) => q.ratio).filter((r) => typeof r === 'number' && Number.isFinite(r));
    const totalMs = Number(ordered[si].totalTime);
    perSession.push({
      index: si + 1,
      date: Number(ordered[si].date) || 0,
      medianSec: median(times) / 1000,
      totalSec: (Number.isFinite(totalMs) && totalMs > 0 ? totalMs : times.reduce((a, b) => a + b, 0)) / 1000,
      firstAttempt,
      total: list.length,
      firstPct: safePct(firstAttempt, list.length),
      avgCarry: carries.length ? mean(carries) : null,
      adjIndex: ratios.length ? median(ratios) : null,
    });
  }
  result.perSession = perSession;

  /* ---------- Rolling trend ---------- */
  result.rolling = {
    medianSec: rollingMedian(perSession.map((p) => p.medianSec), 10),
    firstRate: rollingMean(perSession.map((p) => p.firstPct), 10),
  };

  result.adjusted = {
    available: adjustedAvailable,
    coverage: safePct(binaryCount, totalQuestions) / 100,
    series: perSession.map((p) => p.adjIndex),
  };

  /* ---------- Improvement summary (headline) ---------- */
  const firstIdx = Math.min(10, ordered.length);
  const lastIdx = Math.min(10, ordered.length);
  const firstQs = [];
  for (let i = 0; i < firstIdx; i++) firstQs.push(...sessionQ[i]);
  const lastQs = [];
  for (let i = ordered.length - lastIdx; i < ordered.length; i++) lastQs.push(...sessionQ[i]);

  const firstMedian = median(firstQs.map((q) => q.timeTaken)) / 1000;
  const lastMedian = median(lastQs.map((q) => q.timeTaken)) / 1000;
  const firstAcc = safePct(firstQs.filter((q) => q.ok).length, firstQs.length);
  const lastAcc = safePct(lastQs.filter((q) => q.ok).length, lastQs.length);

  result.improvement = {
    window: firstIdx,
    firstMedian,
    lastMedian,
    pctChange: firstMedian > 0 ? ((lastMedian - firstMedian) / firstMedian) * 100 : 0,
    firstAcc,
    lastAcc,
    accDelta: lastAcc - firstAcc,
    overlapping: firstIdx + lastIdx > ordered.length,
  };

  /* ---------- Quartiles ---------- */
  if (ordered.length >= 4) {
    const q = [];
    const size = ordered.length / 4;
    for (let b = 0; b < 4; b++) {
      const start = Math.floor(b * size);
      const end = b === 3 ? ordered.length : Math.floor((b + 1) * size);
      const qs = [];
      for (let i = start; i < end; i++) qs.push(...sessionQ[i]);
      const ratios = qs.map((x) => x.ratio).filter((r) => typeof r === 'number' && Number.isFinite(r));
      const carries = qs.filter((x) => x.carry !== null).map((x) => x.carry);
      q.push({
        label: `Q${b + 1}`,
        sessions: end - start,
        range: `${start + 1}-${end}`,
        n: qs.length,
        medianSec: median(qs.map((x) => x.timeTaken)) / 1000,
        adjIndex: ratios.length ? median(ratios) : null,
        firstPct: safePct(qs.filter((x) => x.ok).length, qs.length),
        avgCarry: carries.length ? mean(carries) : null,
      });
    }
    result.quartiles = q;
  }

  /* ---------- Within-set position ---------- */
  if (setSize > 1) {
    const posTimes = new Map();
    const posOk = new Map();
    const posN = new Map();
    for (const q of allQ) {
      if (q.position > setSize) continue;
      if (!posTimes.has(q.position)) { posTimes.set(q.position, []); posOk.set(q.position, 0); posN.set(q.position, 0); }
      posTimes.get(q.position).push(q.timeTaken);
      posN.set(q.position, posN.get(q.position) + 1);
      if (q.ok) posOk.set(q.position, posOk.get(q.position) + 1);
    }
    result.position = [...posTimes.keys()].sort((a, b) => a - b).map((p) => ({
      pos: p,
      n: posN.get(p),
      medianSec: median(posTimes.get(p)) / 1000,
      firstPct: safePct(posOk.get(p), posN.get(p)),
    }));
  }

  /* ---------- Error anatomy ---------- */
  const columns = COLUMN_NAMES.map((name, i) => ({ name, place: i, count: 0 }));
  const magnitude = { '<10': 0, '10-99': 0, '100-999': 0, '1k-10k': 0, '>10k': 0 };
  let oneDigitWrong = 0;
  let multiDigitWrong = 0;
  let differentLength = 0;
  let unclassified = 0;
  let totalMisses = 0;

  for (const q of allQ) {
    if (q.ok) continue;
    totalMisses++;
    if (q.firstAttempt === null || q.expected === null) { unclassified++; continue; }

    const diff = Math.abs(q.firstAttempt - q.expected);
    magnitude[magnitudeBucket(diff)]++;

    const es = String(Math.trunc(Math.abs(q.expected)));
    const fs = String(Math.trunc(Math.abs(q.firstAttempt)));
    if (es.length !== fs.length) {
      differentLength++;
      multiDigitWrong++;
      continue;
    }
    let wrong = 0;
    let wrongPos = -1;
    for (let i = 0; i < es.length; i++) {
      if (es[i] !== fs[i]) { wrong++; wrongPos = i; }
    }
    if (wrong === 1) {
      oneDigitWrong++;
      const place = es.length - 1 - wrongPos; // 0 = units
      if (place < columns.length) columns[place].count++;
    } else if (wrong >= 2) {
      multiDigitWrong++;
    }
  }

  result.errors = {
    totalMisses,
    totalQuestions,
    errPct: safePct(totalMisses, totalQuestions),
    columns: columns.filter((c) => c.count > 0 || c.place < 4),
    oneDigitWrong,
    multiDigitWrong,
    differentLength,
    unclassified,
    magnitude: Object.keys(magnitude).map((k) => ({ bucket: k, count: magnitude[k] })),
  };

  /* ---------- Attempts distribution ---------- */
  let a1 = 0; let a2 = 0; let a3 = 0; let a4 = 0;
  for (const q of allQ) {
    const n = q.attemptCount;
    if (n <= 1) a1++;
    else if (n === 2) a2++;
    else if (n === 3) a3++;
    else a4++;
  }
  result.attempts = { one: a1, two: a2, three: a3, fourPlus: a4, total: totalQuestions };

  /* ---------- Per-day volume ---------- */
  const dayMap = new Map();
  for (const q of allQ) {
    const d = new Date(q.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!dayMap.has(key)) dayMap.set(key, { day: key, ts: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), times: [], ok: 0, n: 0 });
    const rec = dayMap.get(key);
    rec.times.push(q.timeTaken);
    rec.n++;
    if (q.ok) rec.ok++;
  }
  result.perDay = [...dayMap.values()]
    .sort((a, b) => a.ts - b.ts)
    .map((r) => ({
      day: r.day,
      ts: r.ts,
      n: r.n,
      medianSec: median(r.times) / 1000,
      firstPct: safePct(r.ok, r.n),
    }));

  /* ---------- Operand breakdown ---------- */
  if (binaryCount >= totalQuestions * 0.6) {
    const buildSide = (pick) => {
      const m = new Map();
      for (const q of allQ) {
        if (!q.hasPair) continue;
        const v = pick(q);
        if (!m.has(v)) m.set(v, { value: v, n: 0, miss: 0, times: [] });
        const rec = m.get(v);
        rec.n++;
        rec.times.push(q.timeTaken);
        if (!q.ok) rec.miss++;
      }
      return [...m.values()]
        .filter((r) => r.n >= 10)
        .map((r) => ({
          value: r.value,
          n: r.n,
          medianSec: median(r.times) / 1000,
          errPct: safePct(r.miss, r.n),
        }))
        .sort((a, b) => b.errPct - a.errPct || b.n - a.n);
    };
    result.operands = {
      available: true,
      left: buildSide((q) => q.a),
      right: buildSide((q) => q.b),
    };
  }

  /* ---------- Most-missed questions ---------- */
  const missMap = new Map();
  for (const q of allQ) {
    if (q.ok || !q.text) continue;
    missMap.set(q.text, (missMap.get(q.text) || 0) + 1);
  }
  result.mostMissed = [...missMap.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, 10)
    .filter((r) => r.count > 0);

  /* ---------- Slowest recent questions ---------- */
  const recentStart = Math.max(0, ordered.length - Math.max(1, Math.ceil(ordered.length * 0.25)));
  const recentQs = [];
  for (let i = recentStart; i < ordered.length; i++) recentQs.push(...sessionQ[i]);
  result.slowestRecent = recentQs
    .slice()
    .sort((a, b) => b.timeTaken - a.timeTaken)
    .slice(0, 6)
    .map((q) => ({
      text: q.text,
      sec: q.timeTaken / 1000,
      carry: q.carry,
      date: q.date,
      ok: q.ok,
    }));

  /* ---------- Fastest complete set ---------- */
  const fullSets = perSession.filter((p) => p.total === setSize && p.totalSec > 0);
  if (fullSets.length > 0) {
    const best = fullSets.reduce((a, b) => (b.totalSec < a.totalSec ? b : a));
    result.fastestSet = { totalSec: best.totalSec, date: best.date, index: best.index, questions: best.total };
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Scope helpers used by the page                                      */
/* ------------------------------------------------------------------ */

/** Builds the mode -> difficulty -> questions tree from loaded groups. */
export function buildScopeTree(groups) {
  const modes = new Map();
  for (const g of groups) {
    if (!modes.has(g.mode)) modes.set(g.mode, { mode: g.mode, sessions: 0, difficulties: new Map() });
    const m = modes.get(g.mode);
    m.sessions += g.sessions.length;
    if (!m.difficulties.has(g.difficulty)) m.difficulties.set(g.difficulty, { difficulty: g.difficulty, sessions: 0, questions: new Map() });
    const d = m.difficulties.get(g.difficulty);
    d.sessions += g.sessions.length;
    d.questions.set(g.questions, (d.questions.get(g.questions) || 0) + g.sessions.length);
  }
  return modes;
}

/** The single storage key with the most sessions — used as the default scope. */
export function defaultScope(groups) {
  if (!groups || groups.length === 0) return null;
  const best = groups.reduce((a, b) => (b.sessions.length > a.sessions.length ? b : a));
  return { mode: best.mode, difficulty: best.difficulty, questions: best.questions };
}

/** Flattens every session matching a scope ('*' = aggregate). */
export function sessionsForScope(groups, scope) {
  if (!scope) return [];
  const out = [];
  for (const g of groups) {
    if (g.mode !== scope.mode) continue;
    if (scope.difficulty !== '*' && g.difficulty !== scope.difficulty) continue;
    if (scope.questions !== '*' && String(g.questions) !== String(scope.questions)) continue;
    out.push(...g.sessions);
  }
  return out;
}
