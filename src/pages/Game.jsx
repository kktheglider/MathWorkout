import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Header from '../components/Header';
import { Delete } from 'lucide-react';

import { generateCandidates, extractFeatures, modeSelector } from '../utils/multiplicationEngine';
import { readExponentPower } from '../utils/exponents';

/*
 * Audio is created lazily (never at module scope) so importing this file does no
 * network work, and every failure path is swallowed: a missing file, a blocked
 * autoplay policy or a play() promise aborted by the next answer must never
 * surface as an unhandled rejection during a session.
 * The asset lives in /public/audio, so it is served from the Vite base path
 * (BASE_URL already ends with a slash) - a root-absolute '/audio/...' 404s
 * because the app is deployed under '/math/'.
 */
const audioCache = {};
const getAudio = (name) => {
  if (typeof Audio === 'undefined') return null;
  if (!(name in audioCache)) {
    try {
      const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
      audioCache[name] = new Audio(`${base}audio/${name}.mp3`);
    } catch {
      audioCache[name] = null;
    }
  }
  return audioCache[name];
};

const ranges = {
  '+': {
    'Easy': [1, 11],
    'Medium': [10, 88],
    'Hard': [59, 230],
    'Challenging': [500, 1500],
    'Expert': [300000, 900000]
  },
  '-': {
    'Easy': [1, 23],
    'Medium': [1, 113],
    'Hard': [1, 450],
    'Challenging': [500, 3000],
    'Expert': [111111, 999999]
  },
  '√': {
    'Easy': [2, 15],
    'Medium': [8, 20],
    'Hard': [14, 33],
    'Challenging': [30, 50],
    'Expert': [45, 65]
  },
  '^': {
    'Easy': [2, 12],
    'Medium': [5, 20],
    'Hard': [18, 33],
    'Challenging': [30, 50],
    'Expert': [50, 70]
  },
  'X': {
    'Easy': [1, 9],
    'Medium': [2, 12],
    'Hard': [5, 18],
    'Challenging': [21, 99],
    'Expert': [233, 999]
  },
  '/': {
    'Easy': [1, 50],
    'Medium': [2, 121],
    'Hard': [7, 324],
    'Challenging': [21, 3000],
    'Expert': [211, 999999]
  }
};

/*
 * Which operators each mode is allowed to use. Explicit map instead of
 * `mode.includes('Multiplication')`, which matched both 'Multiplication Tables'
 * and 'Multiplication & Division' and made mode routing ambiguous.
 */
const modeOperators = {
  'Addition': ['+'],
  'Subtraction': ['-'],
  'Multiplication': ['X'],
  'Division': ['/'],
  'Addition & Subtraction': ['+', '-'],
  'Multiplication & Division': ['X', '/'],
  'Mixed': ['+', '-', 'X', '/'],
  'Customizable': ['+', '-', 'X', '/'],
  'Arithmetic Memory': ['+', '-', 'X', '/']
};

/*
 * Upper bound on the value Arithmetic Memory is allowed to carry into the next
 * question. Without it the chain compounds (n1 = previous answer) and at Expert
 * a couple of multiplications produce numbers nobody can hold in their head or
 * type on the keypad. These are chain constraints, not difficulty ranges - the
 * `ranges` table above is untouched.
 */
const memoryChainCaps = {
  'Easy': 99,
  'Medium': 999,
  'Hard': 9999,
  'Challenging': 99999,
  'Expert': 9999999
};

const superscripts = { 2: '²', 3: '³', 4: '⁴', 5: '⁵' };

// Every generation retry loop is bounded; a hung generator would freeze the app.
const MAX_ATTEMPTS = 60;

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const opSymbol = (op) => (op === 'X' ? '×' : op === '/' ? '÷' : op);

const listDivisors = (t) => {
  if (!Number.isInteger(t) || t <= 0) return [];
  const small = [], large = [];
  const limit = Math.floor(Math.sqrt(t));
  for (let d = 1; d <= limit; d++) {
    if (t % d === 0) {
      small.push(d);
      if (d * d !== t) large.push(t / d);
    }
  }
  return small.concat(large.reverse());
};

// Divisors that make a real division: never 1 (no-op) and never n itself (answer 1).
const properDivisors = (t) => listDivisors(t).filter(d => d !== 1 && d !== t);

/*
 * Pick from the middle half of the ascending divisor list so the divisor and the
 * quotient are of comparable size. Picking near the start gave `999999 ÷ 3`
 * (trivial divisor, six digit answer); picking near the end gave `n ÷ (n/2)`.
 */
const pickBalancedDivisor = (divisors) => {
  if (!divisors || divisors.length === 0) return null;
  const lo = Math.floor(divisors.length * 0.25);
  const hi = Math.max(lo, Math.ceil(divisors.length * 0.75) - 1);
  return divisors[randInt(lo, hi)];
};

/*
 * Keep the divisor within a factor of DIVISION_BALANCE of sqrt(dividend), so
 * neither side of the question is degenerate: it rules out `999999 ÷ 2` (trivial
 * divisor, six digit answer) and `999946 ÷ 499973` (six digit divisor, answer 2).
 * Small dividends have a wide enough band that nothing is filtered out.
 */
const DIVISION_BALANCE = 10;

const balancedDivisors = (dividend) => {
  const root = Math.sqrt(dividend);
  return properDivisors(dividend).filter(d => d * DIVISION_BALANCE >= root && d <= root * DIVISION_BALANCE);
};

const makeDivisionProblem = (difficulty) => {
  const range = ranges['/'][difficulty] || ranges['/']['Easy'];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const dividend = randInt(range[0], range[1]);
    const divisor = pickBalancedDivisor(balancedDivisors(dividend));
    if (!divisor) continue; // prime, or only degenerate splits - draw another dividend
    return { n1: dividend, n2: divisor, operator: '/', expected: dividend / divisor, text: `${dividend} ÷ ${divisor}` };
  }
  // Bounded fallback: build a dividend inside the range out of two balanced factors.
  const root = Math.max(2, Math.floor(Math.sqrt(range[1])));
  const divisor = randInt(Math.max(2, Math.floor(root / 2)), root);
  const minQ = Math.max(2, Math.ceil(range[0] / divisor));
  const maxQ = Math.max(minQ, Math.floor(range[1] / divisor));
  const quotient = randInt(minQ, maxQ);
  const dividend = divisor * quotient;
  return { n1: dividend, n2: divisor, operator: '/', expected: quotient, text: `${dividend} ÷ ${divisor}` };
};

const makeTwoOperandProblem = (operator, difficulty) => {
  const table = ranges[operator] || ranges['+'];
  const range = table[difficulty] || table['Easy'];
  let n1 = randInt(range[0], range[1]);
  let n2 = randInt(range[0], range[1]);
  // Subtraction must not go negative. Swapping is O(1); the old `while (n2 > n1)`
  // reroll could spin for an unbounded number of iterations.
  if (operator === '-' && n2 > n1) {
    const swap = n1;
    n1 = n2;
    n2 = swap;
  }
  let expected;
  if (operator === '+') expected = n1 + n2;
  else if (operator === '-') expected = n1 - n2;
  else expected = n1 * n2;
  return { n1, n2, operator, expected, text: `${n1} ${opSymbol(operator)} ${n2}` };
};

const memorySeed = (difficulty) => {
  let min, max;
  if (difficulty === 'Easy') { min = 5; max = 10; }
  else if (difficulty === 'Medium') { min = 8; max = 11; }
  else if (difficulty === 'Hard') { min = 10; max = 18; }
  else if (difficulty === 'Challenging') { min = 100; max = 200; }
  else { min = 600; max = 1000; }
  return randInt(min, max);
};

/*
 * Arithmetic Memory: the answer to question N is the first operand of question
 * N+1. Every option below is pre-filtered so the new carried value is a positive
 * integer that still fits under the chain cap, so the chain can never explode,
 * go negative or become fractional.
 */
const memoryOptions = (value, difficulty, cap) => {
  const options = [];

  const addRange = ranges['+'][difficulty] || ranges['+']['Easy'];
  const addHi = Math.min(addRange[1], cap - value);
  if (addHi >= addRange[0]) options.push({ op: '+', lo: addRange[0], hi: addHi });

  const subRange = ranges['-'][difficulty] || ranges['-']['Easy'];
  const subHi = Math.min(subRange[1], value - 1);
  if (subHi >= subRange[0]) options.push({ op: '-', lo: subRange[0], hi: subHi });

  // n2 >= 2 so a chain step never restates the carried value unchanged (`x × 1`).
  const mulRange = ranges['X'][difficulty] || ranges['X']['Easy'];
  const mulLo = Math.max(mulRange[0], 2);
  const mulHi = Math.min(mulRange[1], Math.floor(cap / value));
  if (mulHi >= mulLo) options.push({ op: 'X', lo: mulLo, hi: mulHi });

  const divisors = properDivisors(value);
  if (divisors.length > 0) options.push({ op: '/', divisors });

  return options;
};

const makeMemoryProblem = (difficulty, previousAnswer) => {
  const cap = memoryChainCaps[difficulty] || memoryChainCaps['Easy'];

  let carried = previousAnswer;
  if (!Number.isInteger(carried) || carried < 1 || carried > cap) carried = memorySeed(difficulty);
  if (carried > cap) carried = cap;

  let options = memoryOptions(carried, difficulty, cap);

  // Once the chain is in the top half of its band, force an operator that shrinks
  // it so the value oscillates instead of hugging the cap for the rest of the run.
  if (carried > cap / 2) {
    const shrinking = options.filter(o => o.op === '-' || o.op === '/');
    if (shrinking.length > 0) options = shrinking;
  }

  if (options.length === 0) {
    carried = memorySeed(difficulty);
    options = memoryOptions(carried, difficulty, cap);
  }
  if (options.length === 0) {
    // Unreachable with the current tables, but never return a broken problem.
    return { n1: carried, n2: 1, operator: '+', expected: carried + 1, text: `${carried} + 1` };
  }

  const choice = options[Math.floor(Math.random() * options.length)];
  let n2, expected;
  if (choice.op === '/') {
    n2 = pickBalancedDivisor(choice.divisors);
    expected = carried / n2;
  } else {
    n2 = randInt(choice.lo, choice.hi);
    if (choice.op === '+') expected = carried + n2;
    else if (choice.op === '-') expected = carried - n2;
    else expected = carried * n2;
  }

  return { n1: carried, n2, operator: choice.op, expected, text: `${carried} ${opSymbol(choice.op)} ${n2}` };
};

const generateProblem = (mode, difficulty, tableConfig, previousAnswer = null, historyCache = []) => {
  if (mode === 'Square Root') {
    let min, max;
    if (difficulty === 'Easy') { min = 1; max = 10; }
    else if (difficulty === 'Medium') { min = 11; max = 30; }
    else if (difficulty === 'Hard') { min = 31; max = 99; }
    else if (difficulty === 'Challenging') { min = 100; max = 316; }
    else { min = 317; max = 999; }
    const n = randInt(min, max);
    return { n1: n * n, n2: null, operator: '√', expected: n, text: `√${n * n}` };
  }

  if (mode === 'Cube Root') {
    let min, max;
    if (difficulty === 'Easy') { min = 1; max = 10; }
    else if (difficulty === 'Medium') { min = 11; max = 30; }
    else if (difficulty === 'Hard') { min = 31; max = 50; }
    else if (difficulty === 'Challenging') { min = 51; max = 70; }
    else { min = 71; max = 99; }
    const n = randInt(min, max);
    const cube = n * n * n;
    return { n1: cube, n2: null, operator: '∛', expected: n, text: `∛${cube}` };
  }

  if (mode === 'Math Exponents' || mode === 'Exponents') {
    let min, max;
    if (difficulty === 'Easy') { min = 1; max = 10; }
    else if (difficulty === 'Medium') { min = 11; max = 20; }
    else if (difficulty === 'Hard') { min = 21; max = 50; }
    else if (difficulty === 'Challenging') { min = 51; max = 100; }
    else { min = 101; max = 999; }
    const n = randInt(min, max);
    // The mode menu persists the chosen power; it is re-clamped here because the
    // difficulty can be changed from Results after the power was picked.
    let power = Number(readExponentPower(difficulty));
    let expected = Math.pow(n, power);
    if (!Number.isSafeInteger(expected)) {
      power = 2;
      expected = n * n;
    }
    return { n1: n, n2: power, operator: '^', expected, text: `${n}${superscripts[power] || '²'}` };
  }

  if (mode === 'Multiplication Tables') {
    const config = tableConfig || {};
    const tables = config.selectedTables && config.selectedTables.length > 0 ? config.selectedTables : [2];
    const n1 = tables[Math.floor(Math.random() * tables.length)];

    const n2Candidates = config.selectedFactors && config.selectedFactors.length > 0
      ? config.selectedFactors
      : [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const n2 = n2Candidates[Math.floor(Math.random() * n2Candidates.length)];

    return { n1, n2, operator: 'X', expected: n1 * n2, text: `${n1} × ${n2}`, features: extractFeatures(n1, n2) };
  }

  if (mode === 'Weakness Practice' || mode === 'Carry Stress Mode') {
    const mulRange = ranges['X'][difficulty] || ranges['X']['Easy'];
    const config = { min: mulRange[0], max: mulRange[1] };
    const candidates = generateCandidates(300, config);
    const selected = modeSelector(candidates, mode, historyCache);
    if (!selected || !Number.isInteger(selected.n1) || !Number.isInteger(selected.n2)) {
      // Defensive: never crash the session if the selector returns nothing.
      return makeTwoOperandProblem('X', difficulty);
    }
    return {
      n1: selected.n1,
      n2: selected.n2,
      operator: 'X',
      expected: selected.n1 * selected.n2,
      text: `${selected.n1} × ${selected.n2}`,
      features: selected.features || extractFeatures(selected.n1, selected.n2)
    };
  }

  if (mode === 'Arithmetic Memory') {
    return makeMemoryProblem(difficulty, previousAnswer);
  }

  const allowedOperators = modeOperators[mode] || ['+'];
  const operator = allowedOperators[Math.floor(Math.random() * allowedOperators.length)];

  if (operator === '/') return makeDivisionProblem(difficulty);
  return makeTwoOperandProblem(operator, difficulty);
};

/*
 * "Practice Mistakes" pool: every Multiplication Tables fact the user has ever
 * needed more than one attempt on, weighted by how often it was missed.
 */
const collectMistakeFacts = () => {
  const byFact = new Map();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('mathWorkout_Multiplication Tables_')) continue;

      let records;
      try {
        records = JSON.parse(localStorage.getItem(key) || '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(records)) continue;

      records.forEach(record => {
        if (!record || !Array.isArray(record.details)) return;
        record.details.forEach(d => {
          if (!d || !Array.isArray(d.attempts) || d.attempts.length <= 1) return;
          const match = /^\s*(\d+)\s*[×xX*]\s*(\d+)\s*$/.exec(String(d.questionText || ''));
          if (!match) return;
          const n1 = parseInt(match[1], 10);
          const n2 = parseInt(match[2], 10);
          if (!Number.isInteger(n1) || !Number.isInteger(n2)) return;
          const id = `${n1}x${n2}`;
          const existing = byFact.get(id);
          if (existing) existing.weight += d.attempts.length - 1;
          else byFact.set(id, { n1, n2, weight: d.attempts.length - 1 });
        });
      });
    }
  } catch { /* localStorage unavailable */ }
  return Array.from(byFact.values());
};

const buildMistakeQueue = (facts, count) => {
  const bag = [];
  facts.forEach(f => {
    // Cap the weight so one pathological fact cannot swallow the whole set.
    const copies = Math.max(1, Math.min(f.weight, 20));
    for (let i = 0; i < copies; i++) bag.push(f);
  });
  if (bag.length === 0) return [];

  const queue = [];
  while (queue.length < count) {
    const shuffled = bag.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    for (let i = 0; i < shuffled.length && queue.length < count; i++) queue.push(shuffled[i]);
  }
  return queue;
};

/*
 * Multiplication Tables is normally reached with router state. On a reload (or a
 * direct link) that state is gone; without this the mode silently fell through
 * to plain Multiplication with the generic difficulty ranges. Rebuild the config
 * from the same keys the practice screen persists.
 */
const resolveTableConfig = (mode, routerState) => {
  if (mode !== 'Multiplication Tables') return routerState;
  if (routerState && (routerState.selectedTables || routerState.selectedFactors || routerState.testType)) {
    return routerState;
  }
  let stored = {
    selectedTables: [],
    selectedFactors: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    testType: 'questions',
    timeSetting: '1 Minute',
    questionsSetting: '10'
  };
  try {
    stored = {
      selectedTables: JSON.parse(localStorage.getItem('multiTables_selectedTables') || '[]'),
      selectedFactors: JSON.parse(localStorage.getItem('multiTables_selectedFactors') || '[2,3,4,5,6,7,8,9,10]'),
      testType: localStorage.getItem('multiTables_testType') || 'questions',
      timeSetting: localStorage.getItem('multiTables_timeSetting') || '1 Minute',
      questionsSetting: localStorage.getItem('multiTables_questionsSetting') || '10'
    };
  } catch { /* keep the defaults */ }
  // Anything the caller did pass (e.g. `practiceMistakes: true` on its own) wins.
  return { ...stored, ...(routerState || {}) };
};

const timeLimitMinutes = (timeSetting) => {
  const minutes = parseInt(String(timeSetting || '1').split(' ')[0], 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
};

export default function Game({ settings }) {
  const { mode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Resolved once: the config must not change under the running session.
  const [tableConfig] = useState(() => resolveTableConfig(mode, location.state));

  const [gameState, setGameState] = useState('countdown'); // countdown, playing, done
  const [countdown, setCountdown] = useState(3);

  const [problems, setProblems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [userInput, setUserInput] = useState('');
  const [errorState, setErrorState] = useState(false);
  const [globalTime, setGlobalTime] = useState(0);
  const [currentAttempts, setCurrentAttempts] = useState([]);

  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const countdownValueRef = useRef(3);
  const errorTimeoutRef = useRef(null);
  const navTimeoutRef = useRef(null);

  // The single source of truth for completed answers. The timer reads this
  // instead of closed-over state: the buzzer must see the answer the player just
  // completed, not the one captured when the interval was created.
  const answersRef = useRef([]);
  const questionStartRef = useRef(0);
  const savedRef = useRef(false);
  const finishedRef = useRef(false);
  const inputLockedRef = useRef(false);
  /* Source of truth for the digits typed so far. State alone is not safe here:
     two fast taps can land in the same React batch and both read the same stale
     value, dropping a digit. */
  const inputRef = useRef('');
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      // Leaving mid-countdown or mid-game must not leave a timer running or fire
      // a deferred navigate/save on an unmounted component.
      unmountedRef.current = true;
      clearInterval(countdownRef.current);
      clearInterval(timerRef.current);
      clearTimeout(errorTimeoutRef.current);
      clearTimeout(navTimeoutRef.current);
      countdownRef.current = null;
      timerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let qCount = parseInt(settings.questions, 10);
    if (!Number.isFinite(qCount)) qCount = 10;

    if (tableConfig && mode === 'Multiplication Tables') {
      if (tableConfig.testType === 'questions') {
        qCount = tableConfig.questionsSetting === 'all' ? 100 : parseInt(tableConfig.questionsSetting, 10);
        if (!Number.isFinite(qCount)) qCount = 10;
      } else {
        qCount = 200; // Large batch for time-based test
      }
    }
    qCount = Math.max(1, Math.min(500, qCount));

    const currentDifficulty = settings.modeDifficulties?.[mode] || settings.difficulty;

    let historyCache = [];
    if (mode === 'Weakness Practice') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.startsWith('mathWorkout_Multiplication_') ||
            key.startsWith('mathWorkout_Multiplication Tables_') ||
            key.startsWith('mathWorkout_Weakness Practice_') ||
            key.startsWith('mathWorkout_Carry Stress Mode_')
          )) {
            const records = JSON.parse(localStorage.getItem(key));
            if (Array.isArray(records)) {
              records.forEach(r => {
                if (r && Array.isArray(r.details)) historyCache.push(...r.details);
              });
            }
          }
        }
      } catch { /* ignore unreadable history */ }
      historyCache = historyCache.slice(-300);
    }

    // Practice Mistakes: replay the facts this user has actually got wrong.
    // Fewer than 5 distinct missed facts is not a meaningful drill, so fall back.
    let generated = null;
    if (mode === 'Multiplication Tables' && tableConfig?.practiceMistakes) {
      const facts = collectMistakeFacts();
      if (facts.length >= 5) {
        generated = buildMistakeQueue(facts, qCount).map(f => ({
          n1: f.n1,
          n2: f.n2,
          operator: 'X',
          expected: f.n1 * f.n2,
          text: `${f.n1} × ${f.n2}`,
          features: extractFeatures(f.n1, f.n2)
        }));
      }
    }

    if (!generated || generated.length === 0) {
      generated = [];
      let prevAns = null;
      for (let i = 0; i < qCount; i++) {
        const p = generateProblem(mode, currentDifficulty, tableConfig, prevAns, historyCache);
        generated.push(p);
        if (mode === 'Arithmetic Memory') prevAns = p.expected;
      }
    }
    setProblems(generated);

    countdownValueRef.current = 3;
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      // The state updater stays pure - the old version started the game from
      // inside setCountdown's updater, which StrictMode runs twice.
      countdownValueRef.current -= 1;
      if (countdownValueRef.current > 0) {
        setCountdown(countdownValueRef.current);
        return;
      }
      clearInterval(countdownRef.current);
      countdownRef.current = null;
      questionStartRef.current = Date.now();
      // Batched into one commit, so "0" is never painted.
      setCountdown(0);
      setGameState('playing');
    }, 1000);

    return () => clearInterval(countdownRef.current);
    // Intentionally runs once: the question set is fixed for the whole session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPlayedQuestions = () => {
    if (mode === 'Multiplication Tables' && tableConfig) {
      if (tableConfig.testType === 'time') return `time_${timeLimitMinutes(tableConfig.timeSetting)}`;
      return tableConfig.questionsSetting || '10';
    }
    return settings.questions;
  };

  const saveResults = (finalAnswers) => {
    // A session may only ever be written once: the buzzer and the last-question
    // path can both reach here, and a duplicate record corrupts the history.
    if (savedRef.current) return;
    savedRef.current = true;

    const currentDifficulty = settings.modeDifficulties?.[mode] || settings.difficulty;
    const actualQuestions = getPlayedQuestions();
    const details = Array.isArray(finalAnswers) ? finalAnswers : [];

    const totalTime = details.reduce((acc, a) => acc + a.timeTaken, 0);
    const resultRecord = {
      date: Date.now(),
      mode,
      difficulty: currentDifficulty,
      questions: actualQuestions,
      totalTime,
      details,
      isTimeMode: tableConfig?.testType === 'time'
    };

    const storageKey = `mathWorkout_${mode}_${currentDifficulty}_${actualQuestions}`;
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const existing = Array.isArray(raw) ? raw : [];
      existing.push(resultRecord);
      localStorage.setItem(storageKey, JSON.stringify(existing));
    } catch (e) {
      // Quota or private-mode failure must not take the app down mid-demo.
      console.warn('Could not save results:', e);
    }
  };

  const finishSession = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    clearInterval(timerRef.current);
    timerRef.current = null;
    clearTimeout(errorTimeoutRef.current);
    inputLockedRef.current = true;

    setGameState('done');
    saveResults(answersRef.current);

    const playedQuestions = getPlayedQuestions();
    navTimeoutRef.current = setTimeout(() => {
      if (unmountedRef.current) return;
      navigate(`/results/${encodeURIComponent(mode)}`, { replace: true, state: { playedQuestions } });
    }, 400);
  };

  useEffect(() => {
    if (gameState !== 'playing') return undefined;

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - questionStartRef.current +
        answersRef.current.reduce((acc, a) => acc + a.timeTaken, 0);
      setGlobalTime(elapsed);

      if (mode === 'Multiplication Tables' && tableConfig && tableConfig.testType === 'time') {
        if (elapsed >= timeLimitMinutes(tableConfig.timeSetting) * 60 * 1000) {
          finishSession();
        }
      }
    }, 100);

    return () => {
      clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // finishSession only reads refs and session-stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, mode, tableConfig, navigate, settings]);

  const playSound = (isCorrect) => {
    if (!settings.sounds) return;
    try {
      const audio = getAudio(isCorrect ? 'success' : 'error');
      if (!audio) return;
      audio.currentTime = 0;
      const played = audio.play();
      if (played && typeof played.catch === 'function') played.catch(() => {});
    } catch { /* sound is never allowed to interrupt play */ }
  };

  const handleCorrectAnswer = (finalVal) => {
    const problem = problems[currentIndex];
    if (!problem) return;

    const timeTaken = Date.now() - questionStartRef.current;
    const finalAttempts = [...currentAttempts, finalVal];
    const newAnswers = [...answersRef.current, {
      questionText: problem.text,
      userAnswer: finalVal,
      attempts: finalAttempts,
      isCorrect: true, // it only proceeds on correct
      timeTaken: timeTaken,
      expected: problem.expected,
      features: problem.features || null
    }];

    // Written before any setState so a buzzer firing this same tick sees it.
    answersRef.current = newAnswers;
    inputRef.current = '';
    setUserInput('');
    setCurrentAttempts([]);

    if (currentIndex + 1 >= problems.length) {
      finishSession();
    } else {
      setCurrentIndex(prev => prev + 1);
      questionStartRef.current = Date.now();
    }
  };

  const handleKeyPress = (val) => {
    // inputLockedRef holds during the 300ms wrong-answer flash. Without it a fast
    // second tap appended to the not-yet-cleared input and logged garbage
    // attempts like "13" against a single-digit answer.
    if (gameState !== 'playing' || inputLockedRef.current) return;

    const problem = problems[currentIndex];
    if (!problem) return;

    if (val === 'DEL') {
      setErrorState(false);
      inputRef.current = inputRef.current.slice(0, -1);
      setUserInput(inputRef.current);
      return;
    }

    setErrorState(false);

    const expectedStr = String(problem.expected);
    const newVal = inputRef.current + val;
    if (newVal.length > expectedStr.length) return; // defensive: never overrun
    inputRef.current = newVal;
    setUserInput(newVal);

    // Deliberate: the answer submits the moment it is as long as the expected
    // answer. Up to that point DEL can fix a typo.
    if (newVal.length < expectedStr.length) return;

    if (newVal === expectedStr) {
      playSound(true);
      handleCorrectAnswer(newVal);
      return;
    }

    playSound(false);
    setCurrentAttempts(prev => [...prev, newVal]);
    setErrorState(true);
    inputLockedRef.current = true;
    errorTimeoutRef.current = setTimeout(() => {
      if (unmountedRef.current || finishedRef.current) return;
      inputLockedRef.current = false;
      inputRef.current = '';
      setUserInput('');
      setErrorState(false);
    }, 300);
  };

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    const centi = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
    return `${minutes}:${seconds}.${centi}`;
  };

  if (gameState === 'countdown') {
    return (
      <>
        <Header title={mode} onBack={() => navigate(`/results/${encodeURIComponent(mode)}`, { replace: true })} />
        <div className="page-content" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div className="countdown-circle">
            {countdown}
          </div>
        </div>
      </>
    );
  }

  const currentProblem = problems[currentIndex];

  const getProblemFontSize = (text) => {
    if (!text) return undefined;
    const len = String(text).replace(/<[^>]*>?/gm, '').length;
    if (len > 12) return 'clamp(1.5rem, 6vw, 2.5rem)';
    if (len > 8) return 'clamp(2rem, 8vw, 3rem)';
    return undefined;
  };

  const getAnswerFontSize = (text) => {
    if (!text) return undefined;
    if (text.length > 8) return 'clamp(1.5rem, 6vw, 2rem)';
    if (text.length > 6) return 'clamp(2rem, 7vw, 2.5rem)';
    return undefined;
  };

  return (
    <div className="game-container">
      <Header title={settings.displayTime ? `Time ${formatTime(globalTime)}` : mode} onBack={() => navigate(`/results/${encodeURIComponent(mode)}`, { replace: true })} />

      <div className="page-content" style={{display: 'flex', flexDirection: 'column'}}>
        <div className="problem-box" style={{ fontSize: getProblemFontSize(currentProblem?.text) }}>
          {currentProblem?.text}
        </div>

        <div className={`answer-box ${errorState ? 'error' : ''}`} style={{ fontSize: getAnswerFontSize(userInput) }}>
          {userInput || (
            <span style={{color: 'var(--text-secondary)', fontWeight: 400}}>Tap below</span>
          )}
        </div>

        <div className={`keypad size-${settings.keyboardSize || 'Medium'}`}>
          {[1,2,3,4,5,6,7,8,9].map(num => (
            <button key={num} className="keypad-btn" onPointerDown={(e) => { e.preventDefault(); handleKeyPress(num.toString()); }}>
              {num}
            </button>
          ))}
          <button className="keypad-btn" style={{visibility: 'hidden'}}></button>
          <button className="keypad-btn" onPointerDown={(e) => { e.preventDefault(); handleKeyPress('0'); }}>0</button>
          <button className="keypad-btn action-btn" onPointerDown={(e) => { e.preventDefault(); handleKeyPress('DEL'); }}>
             <Delete size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}
