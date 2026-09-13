import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import Header from '../components/Header';
const BoldCheck = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 448 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/>
  </svg>
);
const BoldX = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 384 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
  </svg>
);

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

/*
 * Question-count options.
 *
 * These MUST stay in step with what the user can actually configure and what
 * Game.jsx will actually run, otherwise the dropdown offers buckets that can
 * never contain history:
 *   - Multiplication Tables: MultiplicationTablesSettings.jsx offers
 *     10 / 20 / 30 / 40 / all questions and 1..6 minute timed runs.
 *     Game.jsx turns 'all' into exactly 100 questions.
 *   - every other mode: Settings.jsx offers 10 / 20 / 40 only.
 */
const TABLE_QUESTION_VALUES = ['10', '20', '30', '40', 'all', 'time_1', 'time_2', 'time_3', 'time_4', 'time_5', 'time_6'];
const STANDARD_QUESTION_VALUES = ['10', '20', '40'];
const DIFFICULTY_ORDER = ['Easy', 'Medium', 'Hard', 'Challenging', 'Expert'];
const DETAIL_PAGE_SIZE = 50;

const isTimeBucket = (q) => String(q ?? '').startsWith('time_');

const questionsLabel = (q, mode) => {
  const s = String(q ?? '');
  if (isTimeBucket(s)) {
    const mins = s.slice('time_'.length);
    return `${mins} Min Time`;
  }
  if (s === 'all') return 'All (100 Questions)';
  if (mode === 'Multiplication Tables') return `${s} Questions`;
  return s;
};

/* Number of extra (wrong) attempts across a session. Every question is retried
   until it is right, so this is "mistakes made", never "questions got wrong". */
const mistakeCount = (record) =>
  (record?.details || []).reduce((acc, d) => acc + (d?.attempts?.length > 1 ? d.attempts.length - 1 : 0), 0);

const firstTryCount = (record) =>
  (record?.details || []).filter(d => d?.attempts && d.attempts.length === 1).length;

/*
 * Short, accurate description of what each mode drills. The ranges mirror
 * generateProblem() in Game.jsx so the copy cannot drift into fiction.
 */
const MODE_GUIDES = {
  'Addition': {
    title: 'Addition',
    lines: [
      'Two whole numbers to add. Difficulty sets how big they get: Easy 1–11, Medium 10–88, Hard 59–230, Challenging 500–1,500, Expert 300,000–900,000.'
    ]
  },
  'Subtraction': {
    title: 'Subtraction',
    lines: [
      'Two whole numbers to subtract, ordered so the answer is never negative.',
      'Ranges: Easy 1–23, Medium 1–113, Hard 1–450, Challenging 500–3,000, Expert 111,111–999,999.'
    ]
  },
  'Multiplication': {
    title: 'Multiplication',
    lines: [
      'Two factors drawn at random from the difficulty range: Easy 1–9, Medium 2–12, Hard 5–18, Challenging 21–99, Expert 233–999.'
    ]
  },
  'Division': {
    title: 'Division',
    lines: [
      'Always divides exactly — no remainders and no decimals in the answer.',
      'Dividend ranges: Easy 1–50, Medium 2–121, Hard 7–324, Challenging 21–3,000, Expert 211–999,999.'
    ]
  },
  'Addition & Subtraction': {
    title: 'Addition & Subtraction',
    lines: [
      'Each question is randomly a + or a −, using that operator’s range for the chosen difficulty. Subtractions never go negative.'
    ]
  },
  'Multiplication & Division': {
    title: 'Multiplication & Division',
    lines: [
      'Each question is randomly a × or a ÷, using that operator’s range for the chosen difficulty. Divisions always come out exact.'
    ]
  },
  'Mixed': {
    title: 'Mixed',
    lines: [
      'Every question independently picks +, −, × or ÷ and uses that operator’s range for the chosen difficulty.'
    ]
  },
  'Arithmetic Memory': {
    title: 'Arithmetic Memory',
    lines: [
      'A chain: every question starts from the answer to the previous one, so you have to carry the running total in your head instead of reading it off the screen.'
    ]
  },
  'Multiplication Tables': {
    title: 'Multiplication Tables',
    lines: [
      'Drills the base tables and the factors you tick on the Practice screen.',
      'Pick a fixed set (10, 20, 30, 40 or all 100 questions) or a timed run of 1–6 minutes. Each choice is stored and charted as its own history.'
    ]
  },
  'Square Root': {
    title: 'Square Root',
    lines: [
      'Always the √ of a perfect square, so the answer is a whole number.',
      'Answer ranges: Easy 1–10, Medium 11–30, Hard 31–99, Challenging 100–316, Expert 317–999.'
    ]
  },
  'Cube Root': {
    title: 'Cube Root',
    lines: [
      'Always the ∛ of a perfect cube, so the answer is a whole number.',
      'Answer ranges: Easy 1–10, Medium 11–30, Hard 31–50, Challenging 51–70, Expert 71–99.'
    ]
  },
  'Math Exponents': {
    title: 'Math Exponents',
    lines: [
      'Squares only — every question is n², and you type the result.',
      'Base ranges: Easy 1–10, Medium 11–20, Hard 21–50, Challenging 51–100, Expert 101–999.'
    ]
  },
  'Weakness Practice': {
    title: 'How it Works',
    lines: [
      'Weakness Practice analyses your past Multiplication performance to automatically target your weak spots (e.g. high-carry chains or specific digit combinations).',
      'It needs a baseline of 25 historical questions to build your profile, and keeps adapting as you improve. Until you reach that baseline, questions are randomised.'
    ]
  },
  'Carry Stress Mode': {
    title: 'Carry Stress Mode',
    lines: [
      'This mode aggressively filters randomly generated multiplications so you only practise problems with dense carry operations. Ready for a challenge?'
    ]
  }
};

const QuestionDetail = ({ q, idx, formatTime }) => {
  const [showAttempts, setShowAttempts] = useState(false);
  const hasMultipleAttempts = q.attempts && q.attempts.length > 1;

  return (
    <div 
      className="history-q" 
      style={{flexDirection: 'column', alignItems: 'flex-start', cursor: hasMultipleAttempts ? 'pointer' : 'default', padding: '0.75rem 0'}} 
      onClick={(e) => {
        if (hasMultipleAttempts) {
          e.stopPropagation();
          setShowAttempts(!showAttempts);
        }
      }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: '0.5rem'}}>
        <span style={{display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap', minWidth: 0, flex: '1 1 auto', overflowWrap: 'anywhere'}}>
          <span>{idx+1}. </span>
          <span dangerouslySetInnerHTML={{__html: q.questionText}} />
          <span> = {q.userAnswer}</span>
          {hasMultipleAttempts && (
            <span style={{
               background: 'var(--surface-color)', 
               color: 'var(--text-secondary)', 
               border: '1px solid var(--border-dark)',
               borderRadius: '10px', 
               padding: '2px 8px', 
               fontSize: '0.7rem', 
               marginLeft: '8px',
               fontWeight: 'normal'
            }}>
              {q.attempts.length} tries
            </span>
          )}
        </span>
        <span style={{fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0}}>{formatTime ? formatTime(q.timeTaken) : ''}</span>
      </div>
      {showAttempts && hasMultipleAttempts && (
        <div style={{fontSize: '0.9rem', color: 'var(--error-color)', marginTop: '0.5rem', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowWrap: 'anywhere'}}>
          {q.attempts.slice(0, -1).map((ans, i) => (
            <div key={i}>Attempt {i + 1}: <span style={{fontWeight: 600}}>{ans}</span></div>
          ))}
        </div>
      )}
    </div>
  );
};

const ResultDetailItem = ({ item, formatTime, isTimeMode, id, index }) => {
  const [isOpen, setIsOpen] = useState(false);
  const details = item.details || [];
  const wrongCount = mistakeCount(item);
  const firstTry = firstTryCount(item);
  const avgPerQ = details.length > 0 ? formatTime(item.totalTime / details.length) : '0s';

  return (
    <div id={id} className="detailed-history" onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer', padding: '0.75rem', borderRadius: '12px', transition: 'box-shadow 0.3s ease', position: 'relative', overflow: 'hidden' }}>
      {index !== undefined && (
        <div title={`Session #${index} of this history`} style={{ position: 'absolute', top: 0, left: 0, background: 'var(--tag-bg)', color: 'var(--tag-text)', padding: '0px 6px', fontSize: '0.6rem', fontWeight: 'bold', borderBottomRightRadius: '6px' }}>
          {index}
        </div>
      )}
      <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: isOpen ? '1rem' : '0', flexWrap: 'wrap', gap: '0.5rem'}}>
        <strong style={{color: 'var(--primary-color)', minWidth: 0}}>
          {isTimeMode ? (
            <span style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'}}>
              <span title="Questions answered before the timer ran out" style={{color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.25rem'}}>{details.length} <BoldCheck size={14}/></span>
              <span title="Wrong attempts made along the way (every question is retried until it is right)" style={{color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '0.25rem'}}>{wrongCount} <BoldX size={14}/></span>
              <span title="Average time per question" style={{fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal'}}>Avg {avgPerQ}</span>
            </span>
          ) : (
            <span style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'}}>
              <span title="Total time for the set">{formatTime(item.totalTime)}</span>
              <span style={{color: firstTry === details.length ? 'var(--success-color)' : 'var(--error-color)', display: 'flex', alignItems: 'center', fontSize: '0.9rem', gap: '0.25rem'}} title="Answered right on the first attempt">
                {firstTry}/{details.length}
              </span>
              <span title="Average time per question" style={{fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal'}}>Avg {avgPerQ}</span>
            </span>
          )}
        </strong>
        <span style={{color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center'}}>
          {new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          <span style={{marginLeft: '8px', fontSize: '0.7rem'}}>{isOpen ? '▲' : '▼'}</span>
        </span>
      </div>

      {isOpen && (
        <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem'}}>
          <div style={{display: 'flex', justifyContent: 'space-around', paddingBottom: '1rem', fontWeight: 'bold', fontSize: '1rem', flexWrap: 'wrap', gap: '0.5rem'}}>
             {isTimeMode ? (
               <>
                 <span title="Questions answered before the timer ran out" style={{color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.25rem'}}>{details.length} <BoldCheck size={14}/></span>
                 <span title="Wrong attempts made along the way (every question is retried until it is right)" style={{color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '0.25rem'}}>{wrongCount} <BoldX size={14}/></span>
                 <span title="Average time per question" style={{fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal'}}>Avg {avgPerQ}</span>
               </>
             ) : (
               <>
                 <span style={{color: firstTry === details.length ? 'var(--success-color)' : 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '0.25rem'}} title="Answered right on the first attempt">
                   1st Attempt: {firstTry}/{details.length}
                 </span>
                 <span title="Average time per question" style={{fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal'}}>Avg {avgPerQ}</span>
               </>
             )}
          </div>
          {details.map((q, idx) => (
            <QuestionDetail key={idx} q={q} idx={idx} formatTime={formatTime} />
          ))}
        </div>
      )}
    </div>
  );
};

export default function Results({ settings, updateSetting }) {
  const { mode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [history, setHistory] = useState([]);
  
  const [statScope, setStatScope] = useState('1');
  const [customScope, setCustomScope] = useState('20');
  const [showMedianDetails, setShowMedianDetails] = useState(false);
  const [showAttemptDetails, setShowAttemptDetails] = useState(false);
  const [scoreView, setScoreView] = useState('top5');
  const [visibleCount, setVisibleCount] = useState(DETAIL_PAGE_SIZE);
  const [pendingScrollTo, setPendingScrollTo] = useState(null);

  const processedRef = useRef(false);
  // Keep the latest updateSetting reachable without putting an unstable
  // function reference in the effect's dependency list.
  const updateSettingRef = useRef(updateSetting);
  useEffect(() => { updateSettingRef.current = updateSetting; });

  const getBackRoute = () => {
    // Verified against the route table in App.jsx.
    if (['Multiplication', 'Weakness Practice', 'Carry Stress Mode'].includes(mode)) return '/multiplication-modes';
    if (mode === 'Multiplication Tables') return '/multiplication-tables/practice';
    if (['Square Root', 'Cube Root', 'Math Exponents'].includes(mode)) return `/menu/${encodeURIComponent(mode)}`;
    return '/';
  };

  useEffect(() => {
    if (location.state?.playedQuestions && !processedRef.current) {
      processedRef.current = true;
      if (mode === 'Multiplication Tables') {
         updateSettingRef.current('tableQuestions', location.state.playedQuestions);
      } else if (!isNaN(parseInt(location.state.playedQuestions, 10))) {
         updateSettingRef.current('questions', parseInt(location.state.playedQuestions, 10));
      }
      // Clear only OUR payload and keep React Router's own history state (key/idx)
      // intact — blowing the whole entry away with replaceState({}) desynchronises
      // the router's history index and makes a later back-navigation replay this
      // effect, clobbering whatever bucket the user had since selected.
      const routerState = window.history.state;
      window.history.replaceState(
        routerState && typeof routerState === 'object' ? { ...routerState, usr: null } : null,
        ''
      );
    }
  }, [location.state?.playedQuestions, mode]);

  const currentDifficulty = settings.modeDifficulties?.[mode] || settings.difficulty;
  const currentQuestions = mode === 'Multiplication Tables'
    ? String(settings.tableQuestions ?? '10')
    : String(settings.questions ?? 10);

  const storageKey = `mathWorkout_${mode}_${currentDifficulty}_${currentQuestions}`;

  /* One localStorage pass per bucket change: load this bucket's history AND note
     every other bucket for this mode, so an empty screen can point somewhere with
     data instead of just going blank. */
  const [modeBuckets, setModeBuckets] = useState([]);

  useEffect(() => {
    let saved = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      // Never crash the whole screen on one malformed record.
      if (Array.isArray(parsed)) saved = parsed.filter(r => r && Array.isArray(r.details));
    } catch {
      saved = [];
    }
    setHistory(saved);
    setVisibleCount(DETAIL_PAGE_SIZE);

    const prefix = `mathWorkout_${mode}_`;
    const found = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const sep = rest.indexOf('_');
        if (sep <= 0) continue;
        let count = 0;
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(parsed)) count = parsed.length;
        } catch { count = 0; }
        if (count > 0) {
          found.push({ key, difficulty: rest.slice(0, sep), questions: rest.slice(sep + 1), count });
        }
      }
    } catch { /* localStorage unavailable */ }
    found.sort((a, b) => {
      const d = DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty);
      if (d !== 0) return d;
      return String(a.questions).localeCompare(String(b.questions), undefined, { numeric: true });
    });
    setModeBuckets(found);
  }, [mode, storageKey]);

  /* The dropdown must only offer buckets the app can actually produce, but it
     must also be able to *display* the bucket it is currently pointed at, plus
     any legacy bucket that already holds data. */
  /* Difficulty is meaningless for Multiplication Tables (the questions come from
     the selected tables and factors) but it still keys the history bucket, so
     offering it just strands people in empty buckets. Keep it only if their
     existing data actually spans more than one difficulty. */
  const showDifficultyPicker = useMemo(() => {
    if (mode !== 'Multiplication Tables') return true;
    const seen = new Set(modeBuckets.map(b => b.difficulty));
    seen.add(currentDifficulty);
    return seen.size > 1;
  }, [mode, modeBuckets, currentDifficulty]);

  const questionOptions = useMemo(() => {
    const canonical = mode === 'Multiplication Tables' ? TABLE_QUESTION_VALUES : STANDARD_QUESTION_VALUES;
    const values = [...canonical];
    modeBuckets.forEach(b => { if (!values.includes(b.questions)) values.push(b.questions); });
    if (!values.includes(currentQuestions)) values.push(currentQuestions);
    return values;
  }, [mode, modeBuckets, currentQuestions]);

  const formatTime = (ms) => {
    const safeMs = Number.isFinite(ms) ? ms : 0;
    const totalSeconds = Math.floor(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    const centi = Math.floor((safeMs % 1000) / 10).toString().padStart(2, '0');

    if (minutes === '00') {
      return (
        <>
          {Number(seconds)}.{centi}<span style={{ color: 'var(--text-secondary)', fontSize: '0.75em', marginLeft: '1px', fontWeight: 'normal' }}>s</span>
        </>
      );
    }
    return `${minutes}:${seconds}.${centi}`;
  };

  /*
   * The bucket key is the single source of truth for the framing of this screen:
   * Game.jsx only ever writes a `time_N` suffix when it ran a timed test. The old
   * expression OR-ed in `history[0]?.isTimeMode`, so one legacy record decided the
   * framing for the whole bucket. Individual rows still honour their own recorded
   * flag, falling back to the bucket when a record predates the flag.
   */
  const isTimeMode = isTimeBucket(currentQuestions);
  const recordIsTimeMode = useCallback(
    (record) => (typeof record?.isTimeMode === 'boolean' ? record.isTimeMode : isTimeMode),
    [isTimeMode]
  );

  /* Chart colours have to come from the active theme, not from a hardcoded hex.
     Read them after the paint that applied `data-theme` in App.jsx. */
  const [chartColors, setChartColors] = useState({ line: '#0d47a1', text: '#475569', grid: '#cbd5e1' });
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const cs = getComputedStyle(document.documentElement);
      const read = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
      setChartColors({
        line: read('--primary-color', '#0d47a1'),
        text: read('--text-secondary', '#475569'),
        grid: read('--border-dark', '#cbd5e1')
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [settings.theme]);

  const chartUnit = isTimeMode ? 'Questions answered' : 'Total time (seconds)';

  const chartData = {
    labels: history.map((_, i) => i + 1),
    datasets: [
      {
        label: chartUnit,
        data: history.map(h => (isTimeMode ? h.details.length : h.totalTime / 1000)),
        borderColor: chartColors.line,
        backgroundColor: chartColors.line,
        borderWidth: 2,
        pointRadius: history.length > 40 ? 0 : 2,
        pointHitRadius: 12,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        callbacks: {
          title: (items) => {
            const record = history[items[0].dataIndex];
            const when = record ? new Date(record.date).toLocaleString() : '';
            return `Session #${items[0].label}${when ? ` · ${when}` : ''}`;
          },
          label: (ctx) => {
            const record = history[ctx.dataIndex];
            if (isTimeMode) {
              return `${ctx.parsed.y} questions answered · ${mistakeCount(record)} wrong attempts`;
            }
            return `${ctx.parsed.y.toFixed(2)} s total · ${firstTryCount(record)}/${(record?.details || []).length} first try`;
          }
        }
      }
    },
    scales: {
      y: {
        display: true,
        beginAtZero: false,
        title: { display: true, text: chartUnit, color: chartColors.text, font: { size: 10 } },
        ticks: { color: chartColors.text, font: { size: 9 }, maxTicksLimit: 5 },
        grid: { color: chartColors.grid, drawTicks: false }
      },
      x: {
        display: true,
        title: { display: true, text: 'Session (oldest → newest)', color: chartColors.text, font: { size: 10 } },
        ticks: { color: chartColors.text, font: { size: 9 }, maxTicksLimit: 8, autoSkip: true, maxRotation: 0 },
        grid: { display: false }
      }
    }
  };

  /* O(1), reference-based ordinal lookup. The old code did
     history.findIndex(h => h.date === item.date) per row: O(n^2) and wrong when
     two sessions share a timestamp. */
  const ordinalOf = useMemo(() => new Map(history.map((h, i) => [h, i + 1])), [history]);

  /* Best-first ranking. In a timed bucket ties on "questions answered" are the
     norm (19 real sessions, only 14 distinct counts), so break them on fewer
     mistakes, then on the earlier session. Count buckets are ranked purely on
     total time, exactly as before. */
  const rankedBest = useMemo(() => {
    const list = [...history];
    if (isTimeMode) {
      list.sort((a, b) =>
        (b.details.length - a.details.length) ||
        (mistakeCount(a) - mistakeCount(b)) ||
        (a.date - b.date)
      );
    } else {
      list.sort((a, b) => a.totalTime - b.totalTime);
    }
    return list;
  }, [history, isTimeMode]);

  const scoreLimit = scoreView.endsWith('10') ? 10 : 5;
  const shownScores = scoreView.startsWith('top')
    ? rankedBest.slice(0, scoreLimit)
    : [...rankedBest].reverse().slice(0, scoreLimit);

  const newestFirst = useMemo(() => [...history].reverse(), [history]);
  const visibleResults = newestFirst.slice(0, visibleCount);

  /* Jumping from the Scores list to a session that is not rendered yet used to be
     a dead click (3 of the 10 best Multiplication sessions sit outside the first
     50 rows). Expand the list far enough first, then scroll. */
  const focusSession = useCallback((ordinal) => {
    if (!ordinal) return;
    const position = history.length - ordinal; // index within newestFirst
    setVisibleCount(prev => (position < prev ? prev : Math.min(history.length, position + 5)));
    setPendingScrollTo(ordinal);
  }, [history.length]);

  useEffect(() => {
    if (pendingScrollTo == null) return;
    const el = document.getElementById(`history-item-${pendingScrollTo}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash-highlight');
      void el.offsetWidth;
      el.classList.add('flash-highlight');
    }
    setPendingScrollTo(null);
  }, [pendingScrollTo, visibleCount]);

  // Calculate Statistics
  const maxScope = Math.max(1, history.length);
  // parseInt(customScope) || 1 accepted '', '0', '-5' and 999999: a negative slice
  // silently dropped the newest sets and an empty box showed "last 1" with no clue.
  const customScopeValue = Math.min(Math.max(parseInt(customScope, 10) || 1, 1), maxScope);

  const statHist = useMemo(() => {
    let limit = history.length;
    if (statScope === '1') limit = 1;
    else if (statScope === '5') limit = 5;
    else if (statScope === '10') limit = 10;
    else if (statScope === 'custom') limit = customScopeValue;
    return [...history].reverse().slice(0, limit);
  }, [history, statScope, customScopeValue]);

  let totalQs = 0;
  let firstAttemptQs = 0;
  let secondAttemptQs = 0;
  let thirdAttemptQs = 0;
  let moreThanThreeAttemptQs = 0;
  const allTimes = [];
  let flawlessSets = 0;

  statHist.forEach(h => {
    let setFlawless = true;
    const hDetails = h.details || [];
    hDetails.forEach(q => {
      totalQs++;
      if (q.attempts && q.attempts.length === 1) {
        firstAttemptQs++;
      } else {
        setFlawless = false;
        if (q.attempts && q.attempts.length === 2) secondAttemptQs++;
        else if (q.attempts && q.attempts.length === 3) thirdAttemptQs++;
        else if (q.attempts && q.attempts.length > 3) moreThanThreeAttemptQs++;
      }
      if (Number.isFinite(q.timeTaken)) allTimes.push(q.timeTaken);
    });
    if (setFlawless && hDetails.length > 0) flawlessSets++;
  });

  const accuracy = totalQs > 0 ? Math.round((firstAttemptQs / totalQs) * 100) : 0;
  const avgTime = allTimes.length > 0 ? allTimes.reduce((a,b)=>a+b, 0) / allTimes.length : 0;
  
  allTimes.sort((a,b) => a - b);
  const medianTime = allTimes.length > 0 ? (allTimes.length % 2 !== 0 ? allTimes[Math.floor(allTimes.length/2)] : (allTimes[allTimes.length/2 - 1] + allTimes[allTimes.length/2]) / 2) : 0;
  
  /* allTimes is sorted ascending, so the first slice really is the fastest half
     and the second really is the slowest half. For an odd count the median value
     belongs to neither half. With fewer than two samples there is no meaningful
     split, so both halves fall back to the whole (tiny) set instead of the
     previous silent 0.00s. */
  const midIndex = Math.floor(allTimes.length / 2);
  const fastestHalf = allTimes.length < 2 ? allTimes : allTimes.slice(0, midIndex);
  const slowestHalf = allTimes.length < 2 ? allTimes : allTimes.slice(allTimes.length % 2 === 0 ? midIndex : midIndex + 1);

  const avgFirstHalf = fastestHalf.length > 0 ? fastestHalf.reduce((a,b)=>a+b, 0) / fastestHalf.length : 0;
  const avgSecondHalf = slowestHalf.length > 0 ? slowestHalf.reduce((a,b)=>a+b, 0) / slowestHalf.length : 0;

  const lastResult = history.length > 0 ? history[history.length - 1] : null;
  const lastDetails = lastResult?.details || [];
  const lastIsTimeMode = lastResult ? recordIsTimeMode(lastResult) : isTimeMode;

  return (
    <>
      <Header title={mode} backTo={getBackRoute()} />
      <div className="page-content">

        <div style={{textAlign: 'center', marginBottom: '0.75rem'}}>
          <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', fontWeight: 600}}>Last Result</div>
          {!lastResult && (
            <div style={{fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem'}}>
              Nothing recorded in this history yet
            </div>
          )}
          {lastResult && (lastIsTimeMode ? (
            <div style={{fontSize: '1.5rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap'}}>
              <span>Answered:</span>
              <span title="Questions answered before the timer ran out" style={{color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.25rem'}}>{lastDetails.length} <BoldCheck size={18}/></span>
              <span title="Wrong attempts made along the way (every question is retried until it is right)" style={{color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '0.25rem'}}>{mistakeCount(lastResult)} <BoldX size={18}/></span>
              <span title="Average time per question" style={{fontSize: '1.2rem', color: 'var(--text-secondary)', fontWeight: 'normal'}}>Avg {lastDetails.length > 0 ? formatTime(lastResult.totalTime / lastDetails.length) : '0s'}</span>
            </div>
          ) : (
            <div style={{fontSize: '1.5rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap'}}>
              <span>Time: {formatTime(lastResult?.totalTime || 0)}</span>
              <span style={{color: firstTryCount(lastResult) === lastDetails.length ? 'var(--success-color)' : 'var(--error-color)', display: 'flex', alignItems: 'center', fontSize: '1.25rem', gap: '0.25rem'}} title="Answered right on the first attempt">
                {firstTryCount(lastResult)}/{lastDetails.length}
              </span>
              <span title="Average time per question" style={{fontSize: '1.2rem', color: 'var(--text-secondary)', fontWeight: 'normal'}}>Avg {lastDetails.length > 0 ? formatTime(lastResult.totalTime / lastDetails.length) : '0s'}</span>
            </div>
          ))}
          <div style={{fontSize: '1rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap'}}>
            <span>{isTimeMode ? 'Test:' : 'Questions:'}</span>
            <select
              value={currentQuestions}
              onChange={e => {
                if (mode === 'Multiplication Tables') updateSetting('tableQuestions', e.target.value);
                else updateSetting('questions', parseInt(e.target.value, 10));
              }}
              style={{border: '1px solid var(--border-dark)', borderRadius: '4px', background: 'var(--surface-color)', padding: '2px 4px', fontSize: '0.9rem', outline: 'none', color: 'inherit'}}
            >
              {questionOptions.map(value => (
                <option key={value} value={value}>{questionsLabel(value, mode)}</option>
              ))}
            </select>

            {showDifficultyPicker && (
              <>
            <span style={{marginLeft: '0.5rem'}}>Difficulty:</span>
            <select 
              value={currentDifficulty} 
              onChange={e => {
                updateSetting('modeDifficulties', {
                  ...(settings.modeDifficulties || {}),
                  [mode]: e.target.value
                });
              }}
              style={{border: '1px solid var(--border-dark)', borderRadius: '4px', background: 'var(--surface-color)', padding: '2px 4px', fontSize: '0.9rem', outline: 'none', color: 'inherit'}}
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
              <option value="Challenging">Challenging</option>
              <option value="Expert">Expert</option>
            </select>
              </>
            )}
            {mode === 'Multiplication Tables' && !showDifficultyPicker && (
              <span
                title="Which tables and factors you drill is set on the Practice screen, so difficulty does not change these questions."
                style={{marginLeft: '0.5rem', color: 'var(--muted)', fontSize: '0.85rem'}}
              >
                Tables set in Practice
              </span>
            )}
          </div>
        </div>

        {history.length > 0 ? (
          <>
            <div className="chart-container">
              <h3 className="section-title" style={{marginBottom: '0.25rem'}}>Score Graph</h3>
              <div style={{fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.5rem'}}>
                {isTimeMode
                  ? 'Questions answered per timed run — higher is better'
                  : 'Total seconds per set — lower is better'}
              </div>
              <div style={{ height: '180px' }}>
                <Line options={chartOptions} data={chartData} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexDirection: 'row', alignItems: 'flex-start', maxWidth: '600px', margin: '1rem auto' }}>
              <div className="results-list" style={{ margin: 0, flex: '1 1 0', minWidth: 0, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem'}}>
                  <h3 className="section-title" style={{ margin: 0, paddingTop: 0, fontSize: '1rem' }}>Scores</h3>
                  <select 
                    value={scoreView}
                    onChange={(e) => setScoreView(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-color)', color: 'inherit', outline: 'none' }}
                  >
                    <option value="top5">Top 5</option>
                    <option value="top10">Top 10</option>
                    <option value="bottom5">Lowest 5</option>
                    <option value="bottom10">Lowest 10</option>
                  </select>
                </div>
                <div style={{fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '-0.25rem'}}>
                  {isTimeMode ? 'Ranked by questions answered' : 'Ranked by total time for the set'}
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                  {shownScores.map((item) => {
                    const wCount = mistakeCount(item);
                    const details = item.details || [];
                    const firstTry = firstTryCount(item);
                    const originalIndex = ordinalOf.get(item);
                    const rowIsTimeMode = recordIsTimeMode(item);
                    return (
                      <div
                        key={`score-${originalIndex}`}
                        className="result-item"
                        title={`Session #${originalIndex} — tap to jump to it`}
                        style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.9rem', marginBottom: 0, cursor: 'pointer', flexWrap: 'wrap', minWidth: 0}}
                        onClick={() => focusSession(originalIndex)}
                      >
                        <span style={{background: 'var(--tag-bg)', color: 'var(--tag-text)', padding: '0 4px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold', lineHeight: '1.4', height: 'fit-content'}}>{originalIndex}</span>
                        {rowIsTimeMode ? (
                          <span style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                            <span title="Questions answered" style={{color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.2rem'}}>{details.length} <BoldCheck size={12}/></span>
                            <span title="Wrong attempts made along the way" style={{color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '0.2rem'}}>{wCount} <BoldX size={12}/></span>
                          </span>
                        ) : (
                          <span style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                            <span title="Total time for the set">{formatTime(item.totalTime)}</span>
                            <span style={{color: firstTry === details.length ? 'var(--success-color)' : 'var(--error-color)', display: 'flex', alignItems: 'center', fontSize: '0.8rem', gap: '0.2rem'}} title="Answered right on the first attempt">
                              {firstTry}/{details.length}
                            </span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: 'var(--surface-color)', borderRadius: '12px', padding: '0.75rem', border: '1px solid var(--border-light)', flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem'}}>
                  <h3 className="section-title" style={{ margin: 0, paddingTop: 0, fontSize: '1rem' }}>Stats</h3>
                  <select 
                    value={statScope}
                    onChange={(e) => setStatScope(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-color)', color: 'inherit', outline: 'none' }}
                  >
                    <option value="1">Last 1</option>
                    <option value="5">Last 5</option>
                    <option value="10">Last 10</option>
                    <option value="all">All</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                
                {statScope === 'custom' && (
                  <div style={{display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem', fontSize: '0.85rem', flexWrap: 'wrap'}}>
                    <span>Sets:</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={maxScope}
                      value={customScope}
                      onChange={(e) => setCustomScope(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                      onBlur={() => setCustomScope(String(customScopeValue))}
                      style={{ width: '48px', padding: '2px 4px', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-color)', color: 'inherit' }}
                    />
                    <span style={{color: 'var(--text-secondary)'}}>of {maxScope}</span>
                  </div>
                )}

                {/* Every figure below is measured over exactly this slice of history. */}
                <div style={{fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.35rem'}}>
                  Newest {statHist.length} {statHist.length === 1 ? 'set' : 'sets'} · {totalQs} questions
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.25rem' }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}} title={`Questions across the newest ${statHist.length} set(s)`}>
                    <span style={{color: 'var(--text-secondary)'}}>Total Ques:</span>
                    <span style={{fontWeight: 600, color: 'var(--primary-color)'}}>{totalQs}</span>
                  </div>

                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}} title="Mean time per question across every question in scope">
                    <span style={{color: 'var(--text-secondary)'}}>Avg/Q:</span>
                    <span style={{fontWeight: 600, color: 'var(--primary-color)'}}>{formatTime(avgTime)}</span>
                  </div>

                  <div
                    title="Middle time per question across every question in scope"
                    onClick={() => setShowMedianDetails(!showMedianDetails)}
                    style={{display: 'flex', flexDirection: 'column', gap: '0.2rem', cursor: 'pointer', background: showMedianDetails ? 'var(--bg-color)' : 'transparent', padding: showMedianDetails ? '0.25rem' : '0', borderRadius: '4px'}}
                  >
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}}>
                      <span style={{color: 'var(--text-secondary)'}}>Median/Q:</span>
                      <span style={{fontWeight: 600, color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '4px'}}>
                        {formatTime(medianTime)} 
                        <span style={{fontSize: '0.6rem', color: 'var(--text-secondary)'}}>{showMedianDetails ? '▲' : '▼'}</span>
                      </span>
                    </div>
                    {showMedianDetails && (
                      <div style={{display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.25rem'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingLeft: '0.25rem'}}>
                          <span style={{color: 'var(--text-secondary)'}} title={`Mean of the ${fastestHalf.length} fastest question times in scope`}>Avg (Fast 50%):</span>
                          <span style={{fontWeight: 500, color: 'var(--success-color)'}}>{formatTime(avgFirstHalf)}</span>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingLeft: '0.25rem'}}>
                          <span style={{color: 'var(--text-secondary)'}} title={`Mean of the ${slowestHalf.length} slowest question times in scope`}>Avg (Slow 50%):</span>
                          <span style={{fontWeight: 500, color: 'var(--error-color)'}}>{formatTime(avgSecondHalf)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    title="Share of questions answered correctly on the very first attempt. Nothing is ever left wrong — a question is retried until it is right — so this is a speed/precision measure, not a score out of 100."
                    onClick={() => setShowAttemptDetails(!showAttemptDetails)}
                    style={{display: 'flex', flexDirection: 'column', gap: '0.2rem', cursor: 'pointer', background: showAttemptDetails ? 'var(--bg-color)' : 'transparent', padding: showAttemptDetails ? '0.25rem' : '0', borderRadius: '4px'}}
                  >
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}}>
                      <span style={{color: 'var(--text-secondary)'}}>1st Try:</span>
                      <span style={{fontWeight: 600, color: accuracy >= 95 ? 'var(--success-color)' : accuracy >= 80 ? 'var(--primary-color)' : 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '4px'}}>
                        <span>{accuracy}%</span>
                        <span style={{fontSize: '0.6rem', color: 'var(--text-secondary)'}}>{showAttemptDetails ? '▲' : '▼'}</span>
                      </span>
                    </div>
                    {showAttemptDetails && (
                      <div style={{display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.25rem'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingLeft: '0.25rem'}}>
                          <span style={{color: 'var(--text-secondary)'}}>1st Attempt:</span>
                          <span style={{fontWeight: 500, color: 'var(--success-color)'}}>{firstAttemptQs}/{totalQs}</span>
                        </div>
                        {secondAttemptQs > 0 && (
                          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingLeft: '0.25rem'}}>
                            <span style={{color: 'var(--text-secondary)'}}>2nd Attempt:</span>
                            <span style={{fontWeight: 500, color: 'var(--text-primary)'}}>{secondAttemptQs}/{totalQs}</span>
                          </div>
                        )}
                        {thirdAttemptQs > 0 && (
                          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingLeft: '0.25rem'}}>
                            <span style={{color: 'var(--text-secondary)'}}>3rd Attempt:</span>
                            <span style={{fontWeight: 500, color: 'var(--text-primary)'}}>{thirdAttemptQs}/{totalQs}</span>
                          </div>
                        )}
                        {moreThanThreeAttemptQs > 0 && (
                          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingLeft: '0.25rem'}}>
                            <span style={{color: 'var(--text-secondary)'}}>3+ Attempts:</span>
                            <span style={{fontWeight: 500, color: 'var(--error-color)'}}>{moreThanThreeAttemptQs}/{totalQs}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}} title="Sets in scope where every single question was right on the first attempt">
                    <span style={{color: 'var(--text-secondary)'}}>Flawless Sets:</span>
                    <span style={{fontWeight: 600}}>
                      <span style={{color: flawlessSets > 0 ? 'var(--success-color)' : 'var(--text-secondary)'}}>{flawlessSets}</span>
                      <span style={{color: 'var(--primary-color)'}}>/{statHist.length}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="section-title" style={{paddingTop: '0.5rem', paddingBottom: '0.25rem', marginBottom: '0.5rem'}}>All Results & Details</h3>
              <p style={{textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem'}}>
                Tap a result to view questions
                {history.length > visibleResults.length && ` · showing the newest ${visibleResults.length} of ${history.length}`}
              </p>
              {visibleResults.map((item, i) => {
                const ordinal = history.length - i;
                return (
                  <ResultDetailItem
                    key={`session-${ordinal}`}
                    id={`history-item-${ordinal}`}
                    index={ordinal}
                    item={item}
                    formatTime={formatTime}
                    isTimeMode={recordIsTimeMode(item)}
                  />
                );
              })}
              {history.length > visibleResults.length && (
                <button
                  onClick={() => setVisibleCount(c => Math.min(history.length, c + DETAIL_PAGE_SIZE))}
                  style={{display: 'block', width: '100%', padding: '0.75rem', marginBottom: '0.75rem', borderRadius: '12px', border: '1px solid var(--border-dark)', background: 'var(--surface-color)', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'}}
                >
                  Show {Math.min(DETAIL_PAGE_SIZE, history.length - visibleResults.length)} older results
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{padding: '0.5rem 0 2rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>

            <div style={{background: 'var(--surface-color)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-light)'}}>
              <h3 style={{color: 'var(--primary-color)', marginBottom: '0.75rem', fontSize: '1.1rem'}}>Nothing saved in this history yet</h3>
              <p style={{lineHeight: '1.5', marginBottom: '0.75rem'}}>
                Results are kept separately for each combination of mode, difficulty and question count.
                You are looking at{' '}
                <strong style={{color: 'var(--text-primary)'}}>
                  {mode} · {currentDifficulty} · {questionsLabel(currentQuestions, mode)}
                </strong>
                , and no session has been recorded there.
              </p>
              {modeBuckets.length > 0 ? (
                <>
                  <p style={{lineHeight: '1.5', marginBottom: '0.5rem'}}>
                    You do have {mode} history here — tap one to switch to it:
                  </p>
                  <div style={{display: 'flex', flexDirection: 'column', gap: '0.4rem'}}>
                    {modeBuckets.map(bucket => (
                      <button
                        key={bucket.key}
                        onClick={() => {
                          updateSetting('modeDifficulties', {
                            ...(settings.modeDifficulties || {}),
                            [mode]: bucket.difficulty
                          });
                          if (mode === 'Multiplication Tables') {
                            updateSetting('tableQuestions', bucket.questions);
                          } else if (!isNaN(parseInt(bucket.questions, 10))) {
                            updateSetting('questions', parseInt(bucket.questions, 10));
                          }
                        }}
                        style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-dark)', background: 'var(--bg-color)', color: 'var(--text-primary)', fontSize: '0.9rem', cursor: 'pointer'}}
                      >
                        <span style={{minWidth: 0, overflowWrap: 'anywhere'}}>
                          {bucket.difficulty} · {questionsLabel(bucket.questions, mode)}
                        </span>
                        <span style={{color: 'var(--primary-color)', fontWeight: 600, whiteSpace: 'nowrap'}}>
                          {bucket.count} {bucket.count === 1 ? 'set' : 'sets'}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{lineHeight: '1.5'}}>
                  Nothing has been recorded for {mode} at any difficulty yet. Press <strong>Start</strong> below to log your first session.
                </p>
              )}
            </div>

            {(() => {
              const guide = MODE_GUIDES[mode];
              if (!guide) return null;
              return (
                <div style={{background: 'var(--surface-color)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-light)'}}>
                  <h3 style={{color: 'var(--primary-color)', marginBottom: '0.75rem', fontSize: '1.1rem'}}>{guide.title}</h3>
                  {guide.lines.map((line, i) => (
                    <p key={i} style={{lineHeight: '1.5', marginBottom: '0.75rem'}}>{line}</p>
                  ))}
                  <p style={{lineHeight: '1.5', fontSize: '0.85rem', marginBottom: 0}}>
                    A question is always retried until you get it right, so a set is scored on time and on how many you got on the first attempt — never on answers left wrong.
                  </p>
                </div>
              );
            })()}
          </div>
        )}

      </div>

      <div style={{padding: '1rem', background: 'var(--surface-color)', borderTop: '1px solid var(--border-color)', zIndex: 10}}>
        <button className="btn-primary" style={{marginBottom: 0}} onClick={() => {
          try {
            if (mode === 'Multiplication Tables') {
              const selectedTables = JSON.parse(localStorage.getItem('multiTables_selectedTables') || '[]');
              const selectedFactors = JSON.parse(localStorage.getItem('multiTables_selectedFactors') || '[2,3,4,5,6,7,8,9,10]');
              
              let nextTestType = localStorage.getItem('multiTables_testType') || 'time';
              let nextTimeSetting = localStorage.getItem('multiTables_timeSetting') || '1 Minute';
              let nextQuestionsSetting = localStorage.getItem('multiTables_questionsSetting') || '10';

              // Sync dropdown selection before starting
              const tableQ = settings.tableQuestions || '10';
              if (tableQ.toString().startsWith('time_')) {
                 nextTestType = 'time';
                 const mins = tableQ.toString().split('_')[1];
                 nextTimeSetting = mins + ' Minute' + (mins !== '1' ? 's' : '');
              } else if (tableQ === 'all') {
                 nextTestType = 'questions';
                 nextQuestionsSetting = 'all';
              } else {
                 nextTestType = 'questions';
                 nextQuestionsSetting = tableQ.toString();
              }

              localStorage.setItem('multiTables_testType', nextTestType);
              localStorage.setItem('multiTables_timeSetting', nextTimeSetting);
              localStorage.setItem('multiTables_questionsSetting', nextQuestionsSetting);

              navigate(`/game/${encodeURIComponent(mode)}`, { 
                replace: true,
                state: { 
                  selectedTables, 
                  selectedFactors, 
                  testType: nextTestType, 
                  timeSetting: nextTimeSetting, 
                  questionsSetting: nextQuestionsSetting 
                } 
              });
            } else {
              navigate(`/game/${encodeURIComponent(mode)}`, { replace: true });
            }
          } catch(err) {
            alert("Error starting game: " + err.message);
          }
        }}>
          Start
        </button>
      </div>
    </>
  );
}
