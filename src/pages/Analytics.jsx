import { useState, useMemo, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import Header from '../components/Header';
import {
  loadAllSessions,
  analyseSessions,
  buildScopeTree,
  defaultScope,
  sessionsForScope,
} from '../utils/analytics';
import './Analytics.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

const ALL = '*';

/* ------------------------------------------------------------------ */
/* Formatting helpers — never emit NaN / Infinity                      */
/* ------------------------------------------------------------------ */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const fSec = (v, d = 1) => {
  const n = num(v);
  return n === null ? '—' : `${n.toFixed(d)}s`;
};
const fNum = (v, d = 1) => {
  const n = num(v);
  return n === null ? '—' : n.toFixed(d);
};
const fPct = (v, d = 0) => {
  const n = num(v);
  return n === null ? '—' : `${n.toFixed(d)}%`;
};
const fSigned = (v, d = 1, suffix = '%') => {
  const n = num(v);
  if (n === null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(d)}${suffix}`;
};
const fClock = (sec) => {
  const n = num(sec);
  if (n === null) return '—';
  const m = Math.floor(n / 60);
  const s = n - m * 60;
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}s`;
};
const fDate = (ts) => {
  const n = num(ts);
  if (!n) return '—';
  return new Date(n).toLocaleDateString();
};

const questionLabel = (q) => {
  const s = String(q);
  if (s === ALL) return 'All sets';
  if (s.startsWith('time_')) {
    const m = s.slice(5);
    return `${m} min timed`;
  }
  if (s === 'all') return 'Full table (100)';
  return `${s} questions`;
};

/* ------------------------------------------------------------------ */
/* Theme-aware chart colors                                            */
/* ------------------------------------------------------------------ */

function readThemeColors() {
  const fallback = {
    primary: '#0d47a1',
    secondary: '#1976d2',
    text: '#1e293b',
    muted: '#475569',
    grid: '#e2e8f0',
    surface: '#ffffff',
    success: '#047857',
    error: '#dc2626',
  };
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  try {
    const cs = getComputedStyle(document.documentElement);
    const pick = (name, def) => {
      const v = cs.getPropertyValue(name);
      return v && v.trim() ? v.trim() : def;
    };
    return {
      primary: pick('--primary-color', fallback.primary),
      secondary: pick('--secondary-color', fallback.secondary),
      text: pick('--text-primary', fallback.text),
      muted: pick('--text-secondary', fallback.muted),
      grid: pick('--border-color', fallback.grid),
      surface: pick('--surface-color', fallback.surface),
      success: pick('--success-color', fallback.success),
      error: pick('--error-color', fallback.error),
    };
  } catch {
    return fallback;
  }
}

function useThemeColors() {
  const [colors, setColors] = useState(readThemeColors);
  useEffect(() => {
    const update = () => setColors(readThemeColors());
    update();
    if (typeof MutationObserver === 'undefined') return undefined;
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Card({ title, sub, children }) {
  return (
    <div className="an-card">
      {title && <div className="an-card-title">{title}</div>}
      {sub && <div className="an-card-sub">{sub}</div>}
      {children}
    </div>
  );
}

function Tile({ label, value, note }) {
  return (
    <div className="an-tile">
      <div className="an-tile-label">{label}</div>
      <div className="an-tile-value">{value}</div>
      {note && <div className="an-tile-note">{note}</div>}
    </div>
  );
}

function Meter({ label, count, max, suffix = '' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (count / max) * 100)) : 0;
  return (
    <div className="an-meter-row">
      <div className="an-meter-label">{label}</div>
      <div className="an-meter-track">
        <div className="an-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="an-meter-value">{count}{suffix}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Analytics() {
  const colors = useThemeColors();

  // Parse localStorage exactly once, on mount.
  const groups = useMemo(() => loadAllSessions(), []);
  const tree = useMemo(() => buildScopeTree(groups), [groups]);

  const [scope, setScope] = useState(() => defaultScope(groups));

  const modeOptions = useMemo(() => [...tree.values()].sort((a, b) => b.sessions - a.sessions), [tree]);

  const modeEntry = scope ? tree.get(scope.mode) : null;

  const difficultyOptions = useMemo(() => {
    if (!modeEntry) return [];
    return [...modeEntry.difficulties.values()].sort((a, b) => b.sessions - a.sessions);
  }, [modeEntry]);

  const questionOptions = useMemo(() => {
    if (!modeEntry || !scope) return [];
    const counts = new Map();
    for (const d of modeEntry.difficulties.values()) {
      if (scope.difficulty !== ALL && d.difficulty !== scope.difficulty) continue;
      for (const [q, n] of d.questions) counts.set(q, (counts.get(q) || 0) + n);
    }
    return [...counts.entries()]
      .map(([value, sessions]) => ({ value, sessions }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [modeEntry, scope]);

  const scopeSessions = useMemo(() => sessionsForScope(groups, scope), [groups, scope]);
  const data = useMemo(() => analyseSessions(scopeSessions), [scopeSessions]);

  /* ---------- scope change handlers (keep selection valid) ---------- */

  const changeMode = (mode) => {
    const best = groups
      .filter((g) => g.mode === mode)
      .reduce((a, b) => (!a || b.sessions.length > a.sessions.length ? b : a), null);
    setScope(best
      ? { mode, difficulty: best.difficulty, questions: best.questions }
      : { mode, difficulty: ALL, questions: ALL });
  };

  const changeDifficulty = (difficulty) => {
    setScope((prev) => {
      const next = { ...prev, difficulty };
      const valid = groups.some(
        (g) => g.mode === next.mode
          && (difficulty === ALL || g.difficulty === difficulty)
          && (next.questions === ALL || String(g.questions) === String(next.questions))
      );
      if (!valid) next.questions = ALL;
      return next;
    });
  };

  const changeQuestions = (questions) => setScope((prev) => ({ ...prev, questions }));

  /* ---------- Empty state ---------- */

  if (!scope || groups.length === 0) {
    return (
      <>
        <Header title="Analytics" backTo="/" />
        <div className="page-content">
          <div className="an-empty">
            <h3>No data yet</h3>
            <p>
              Analytics appear once you have finished your first set. Play a round from the home
              screen and come back — this page will then show your speed trend, accuracy, carry-load
              difficulty breakdown and the questions that trip you up.
            </p>
            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              Everything here is computed on your device from your saved history. Nothing is uploaded.
            </p>
          </div>
        </div>
      </>
    );
  }

  const { totals, perSession, rolling, adjusted, improvement, quartiles, carry, position,
    errors, attempts, perDay, operands, mostMissed, slowestRecent, fastestSet } = data;

  const enoughSessions = totals.sessions >= 3;

  /* ---------- shared chart config ---------- */

  const baseOptions = (yTitle, extra = {}) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: { color: colors.muted, boxWidth: 10, boxHeight: 10, font: { size: 10 } },
      },
      tooltip: {
        backgroundColor: colors.primary,
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: colors.secondary,
        borderWidth: 1,
      },
      ...(extra.plugins || {}),
    },
    scales: {
      x: {
        ticks: { color: colors.muted, font: { size: 9 }, maxRotation: 0, autoSkipPadding: 16 },
        grid: { color: colors.grid, display: false },
        title: extra.xTitle
          ? { display: true, text: extra.xTitle, color: colors.muted, font: { size: 10 } }
          : { display: false },
      },
      y: {
        display: true,
        beginAtZero: extra.beginAtZero !== false,
        ticks: { color: colors.muted, font: { size: 10 } },
        grid: { color: colors.grid },
        title: { display: true, text: yTitle, color: colors.muted, font: { size: 10 } },
      },
      ...(extra.scales || {}),
    },
  });

  /* ---------- 2. Progress ---------- */

  const progressData = {
    labels: perSession.map((p) => p.index),
    datasets: [
      {
        type: 'line',
        label: 'Session median s/q',
        data: perSession.map((p) => num(p.medianSec)),
        borderColor: 'transparent',
        backgroundColor: colors.secondary,
        pointBackgroundColor: colors.secondary,
        pointRadius: perSession.length > 80 ? 1.5 : 2.5,
        pointHoverRadius: 4,
        showLine: false,
      },
      {
        type: 'line',
        label: '10-set rolling median',
        data: rolling.medianSec.map((v) => num(v)),
        borderColor: colors.primary,
        backgroundColor: colors.primary,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.3,
      },
    ],
  };

  /* ---------- 3. Adjusted index ---------- */

  const adjData = {
    labels: perSession.map((p) => p.index),
    datasets: [
      {
        label: 'Difficulty-adjusted index',
        data: adjusted.series.map((v) => num(v)),
        borderColor: colors.secondary,
        backgroundColor: colors.secondary,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
      },
      {
        label: 'Your all-time average (1.00)',
        data: perSession.map(() => 1),
        borderColor: colors.muted,
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
      },
    ],
  };

  /* ---------- 5. Carry load ---------- */

  const carryData = {
    labels: carry.map((c) => `${c.carry}`),
    datasets: [
      {
        label: 'Median seconds',
        data: carry.map((c) => num(c.medianSec)),
        backgroundColor: colors.secondary,
        borderRadius: 4,
      },
    ],
  };

  /* ---------- 6. Within-set position ---------- */

  const positionData = {
    labels: position.map((p) => `Q${p.pos}`),
    datasets: [
      {
        type: 'bar',
        label: 'Median seconds',
        data: position.map((p) => num(p.medianSec)),
        backgroundColor: colors.secondary,
        borderRadius: 4,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: '1st-attempt %',
        data: position.map((p) => num(p.firstPct)),
        borderColor: colors.error,
        backgroundColor: colors.error,
        borderWidth: 2,
        pointRadius: 2,
        yAxisID: 'y1',
        order: 1,
      },
    ],
  };

  /* ---------- 9. Per-day volume ---------- */

  const dayData = {
    labels: perDay.map((d) => d.day.slice(5)),
    datasets: [
      {
        label: 'Questions answered',
        data: perDay.map((d) => d.n),
        backgroundColor: colors.secondary,
        borderRadius: 4,
      },
    ],
  };

  const colMax = errors ? Math.max(1, ...errors.columns.map((c) => c.count)) : 1;
  const magMax = errors ? Math.max(1, ...errors.magnitude.map((m) => m.count)) : 1;

  const deltaClass = improvement && num(improvement.pctChange) !== null
    ? (improvement.pctChange < -1 ? 'good' : improvement.pctChange > 1 ? 'bad' : 'flat')
    : 'flat';

  return (
    <>
      <Header title="Analytics" backTo="/" />
      <div className="page-content an-page">

        {/* ---------- Scope selector ---------- */}
        <div className="an-scope settings-list" style={{ marginBottom: 0 }}>
          <div className="settings-item">
            <span className="settings-label">Mode</span>
            <select
              className="an-select"
              value={scope.mode}
              onChange={(e) => changeMode(e.target.value)}
            >
              {modeOptions.map((m) => (
                <option key={m.mode} value={m.mode}>{m.mode} ({m.sessions})</option>
              ))}
            </select>
          </div>

          <div className="settings-item">
            <span className="settings-label">Difficulty</span>
            <select
              className="an-select"
              value={scope.difficulty}
              onChange={(e) => changeDifficulty(e.target.value)}
            >
              {difficultyOptions.length > 1 && (
                <option value={ALL}>All difficulties ({modeEntry ? modeEntry.sessions : 0})</option>
              )}
              {difficultyOptions.map((d) => (
                <option key={d.difficulty} value={d.difficulty}>{d.difficulty} ({d.sessions})</option>
              ))}
            </select>
          </div>

          <div className="settings-item">
            <span className="settings-label">Set type</span>
            <select
              className="an-select"
              value={scope.questions}
              onChange={(e) => changeQuestions(e.target.value)}
            >
              {questionOptions.length > 1 && (
                <option value={ALL}>
                  All sets ({questionOptions.reduce((a, b) => a + b.sessions, 0)})
                </option>
              )}
              {questionOptions.map((q) => (
                <option key={q.value} value={q.value}>{questionLabel(q.value)} ({q.sessions})</option>
              ))}
            </select>
          </div>
        </div>

        {!data.ok || totals.questions === 0 ? (
          <div className="an-empty">
            <h3>Nothing recorded here yet</h3>
            <p>This mode / difficulty / set combination has no completed questions. Pick another scope above.</p>
          </div>
        ) : (
          <>
            {/* ---------- 1. Headline ---------- */}
            <div className="an-card an-headline">
              <div className="an-headline-label">Median time per question · last {improvement.window} sets</div>
              <div className="an-headline-value">
                {fNum(improvement.lastMedian, 1)}<span>s</span>
              </div>
              {enoughSessions && !improvement.overlapping && (
                <div className={`an-delta ${deltaClass}`}>
                  {fSigned(improvement.pctChange, 1)} vs your first {improvement.window} sets
                  {' '}({fNum(improvement.firstMedian, 1)}s)
                </div>
              )}
              <div className="an-card-sub" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                {totals.sessions} sets · {totals.questions} questions · {fNum(totals.hours, 1)}h of
                practice across {totals.days} day{totals.days === 1 ? '' : 's'}
                {totals.spanDays > 0 ? ` (${fDate(totals.firstDate)} – ${fDate(totals.lastDate)})` : ''}
              </div>
            </div>

            <div className="an-tiles">
              <Tile
                label="Total questions"
                value={totals.questions}
                note={`${totals.sessions} sets`}
              />
              <Tile
                label="1st-attempt accuracy"
                value={fPct(improvement.lastAcc, 0)}
                note={enoughSessions && !improvement.overlapping
                  ? `was ${fPct(improvement.firstAcc, 0)} · ${fSigned(improvement.accDelta, 1, ' pts')}`
                  : `${attempts.one}/${attempts.total} clean`}
              />
              {adjusted.available && (
                <Tile
                  label="Adjusted index"
                  value={fNum(perSession.length ? perSession[perSession.length - 1].adjIndex : null, 2)}
                  note="1.00 = your all-time pace"
                />
              )}
              {fastestSet && (
                <Tile
                  label="Fastest full set"
                  value={fClock(fastestSet.totalSec)}
                  note={`${fastestSet.questions} Q · ${fDate(fastestSet.date)}`}
                />
              )}
            </div>

            {!enoughSessions && (
              <div className="an-note">
                Trend charts unlock after 3 completed sets in this scope.
              </div>
            )}

            {/* ---------- 2. Progress ---------- */}
            {enoughSessions && (
              <Card
                title="Speed progress"
                sub="Each dot is one set's median seconds per question; the line is the 10-set rolling median, which smooths out easy and hard draws."
              >
                <div className="an-chart tall">
                  <Line data={progressData} options={baseOptions('seconds / question', { xTitle: 'set #', beginAtZero: false })} />
                </div>
              </Card>
            )}

            {/* ---------- 3. Difficulty-adjusted index ---------- */}
            {enoughSessions && adjusted.available && (
              <Card
                title="Difficulty-adjusted index"
                sub="Every question is scored against your own all-time median for questions of the same carry load, so a hard draw does not look like a bad day. Below 1.00 is faster than your all-time average at matched difficulty."
              >
                <div className="an-chart">
                  <Line data={adjData} options={baseOptions('index (1.00 = par)', { xTitle: 'set #', beginAtZero: false })} />
                </div>
              </Card>
            )}

            {/* ---------- 4. Quartiles ---------- */}
            {enoughSessions && quartiles.length === 4 && (
              <Card
                title="Progress by quarter"
                sub="Your history split into four equal chronological blocks."
              >
                <div className="an-table-wrap">
                  <table className="an-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Median s/q</th>
                        {adjusted.available && <th>Adj. index</th>}
                        <th>1st att.</th>
                        <th>Avg carry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quartiles.map((q) => (
                        <tr key={q.label}>
                          <td>{q.label} <span className="an-badge">sets {q.range}</span></td>
                          <td>{fSec(q.medianSec)}</td>
                          {adjusted.available && <td>{fNum(q.adjIndex, 2)}</td>}
                          <td>{fPct(q.firstPct, 1)}</td>
                          <td>{fNum(q.avgCarry, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ---------- 5. Carry load ---------- */}
            {carry.length >= 2 && (
              <Card
                title="Difficulty: carry load"
                sub="Carry load counts how many digit-pair products in the question are 10 or more — a good proxy for how much carrying the problem forces. Buckets with fewer than 10 questions are hidden."
              >
                <div className="an-chart">
                  <Bar data={carryData} options={baseOptions('median seconds', { xTitle: 'carry load' })} />
                </div>
                <div className="an-table-wrap" style={{ marginTop: '0.6rem' }}>
                  <table className="an-table">
                    <thead>
                      <tr>
                        <th>Carry</th><th>n</th><th>Median</th><th>1st-att. errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {carry.map((c) => (
                        <tr key={c.carry}>
                          <td>{c.carry}</td>
                          <td>{c.n}</td>
                          <td>{fSec(c.medianSec)}</td>
                          <td>{fPct(c.errPct, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ---------- 6. Within-set position ---------- */}
            {position.length >= 2 && (
              <Card
                title="Fatigue within a set"
                sub="Median time and first-attempt accuracy by question position across every set. A rising bar with a falling line means you are fading towards the end."
              >
                <div className="an-chart">
                  <Bar
                    data={positionData}
                    options={baseOptions('median seconds', {
                      xTitle: 'position in set',
                      scales: {
                        y1: {
                          position: 'right',
                          beginAtZero: false,
                          suggestedMin: 50,
                          suggestedMax: 100,
                          ticks: { color: colors.muted, font: { size: 10 }, callback: (v) => `${v}%` },
                          grid: { drawOnChartArea: false },
                          title: { display: true, text: '1st-attempt %', color: colors.muted, font: { size: 10 } },
                        },
                      },
                    })}
                  />
                </div>
              </Card>
            )}

            {/* ---------- 7. Error anatomy ---------- */}
            {errors && errors.totalMisses > 0 && (
              <Card
                title="Error anatomy"
                sub={`${errors.totalMisses} of ${errors.totalQuestions} questions (${fPct(errors.errPct, 1)}) were wrong on the first attempt.`}
              >
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  Which column the single wrong digit landed in ({errors.oneDigitWrong} slips)
                </h4>
                {errors.columns.map((c) => (
                  <Meter key={c.name} label={c.name} count={c.count} max={colMax} />
                ))}

                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.8rem 0 0.4rem' }}>
                  How far off ({'|'}your answer − correct{'|'})
                </h4>
                {errors.magnitude.map((m) => (
                  <Meter key={m.bucket} label={m.bucket} count={m.count} max={magMax} />
                ))}

                <div className="an-list" style={{ marginTop: '0.7rem' }}>
                  <div className="an-row">
                    <span className="an-row-main">Two or more digits wrong</span>
                    <span className="an-row-meta">{errors.multiDigitWrong}</span>
                  </div>
                  <div className="an-row">
                    <span className="an-row-main">Answer had the wrong number of digits</span>
                    <span className="an-row-meta">{errors.differentLength}</span>
                  </div>
                </div>

                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.8rem 0 0.4rem' }}>
                  Attempts needed
                </h4>
                <div className="an-list">
                  {[
                    ['1 attempt', attempts.one],
                    ['2 attempts', attempts.two],
                    ['3 attempts', attempts.three],
                    ['4+ attempts', attempts.fourPlus],
                  ].map(([label, n]) => (
                    <div className="an-row" key={label}>
                      <span className="an-row-main">{label}</span>
                      <span className="an-row-meta">
                        {n} · {fPct((n / (attempts.total || 1)) * 100, 1)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ---------- 8. Operand breakdown ---------- */}
            {operands.available && (operands.left.length > 0 || operands.right.length > 0) && (
              <Card
                title="Weakest operands"
                sub="First-attempt error rate by each side of the question, sorted worst first. Only operands seen 10+ times are listed."
              >
                <div className="an-split">
                  {operands.left.length > 0 && (
                    <div>
                      <h4>Left operand</h4>
                      <div className="an-table-wrap">
                        <table className="an-table">
                          <thead>
                            <tr><th>Value</th><th>n</th><th>Median</th><th>Err</th></tr>
                          </thead>
                          <tbody>
                            {operands.left.slice(0, 15).map((o) => (
                              <tr key={o.value}>
                                <td>{o.value}</td>
                                <td>{o.n}</td>
                                <td>{fSec(o.medianSec)}</td>
                                <td className={o.errPct > 0 ? 'neg' : ''}>{fPct(o.errPct, 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {operands.right.length > 0 && (
                    <div>
                      <h4>Right operand</h4>
                      <div className="an-table-wrap">
                        <table className="an-table">
                          <thead>
                            <tr><th>Value</th><th>n</th><th>Median</th><th>Err</th></tr>
                          </thead>
                          <tbody>
                            {operands.right.slice(0, 15).map((o) => (
                              <tr key={o.value}>
                                <td>{o.value}</td>
                                <td>{o.n}</td>
                                <td>{fSec(o.medianSec)}</td>
                                <td className={o.errPct > 0 ? 'neg' : ''}>{fPct(o.errPct, 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* ---------- 9. Per-day volume ---------- */}
            {perDay.length >= 2 && (
              <Card
                title="Practice volume by day"
                sub="Questions answered per calendar day, with that day's median time and first-attempt rate in the table."
              >
                <div className="an-chart">
                  <Bar data={dayData} options={baseOptions('questions', { xTitle: 'date' })} />
                </div>
                <div className="an-table-wrap" style={{ marginTop: '0.6rem', maxHeight: '220px', overflowY: 'auto' }}>
                  <table className="an-table">
                    <thead>
                      <tr><th>Day</th><th>Questions</th><th>Median</th><th>1st att.</th></tr>
                    </thead>
                    <tbody>
                      {[...perDay].reverse().map((d) => (
                        <tr key={d.day}>
                          <td>{d.day}</td>
                          <td>{d.n}</td>
                          <td>{fSec(d.medianSec)}</td>
                          <td>{fPct(d.firstPct, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ---------- 10. Most missed / slowest recent ---------- */}
            {mostMissed.length > 0 && (
              <Card
                title="Most-missed questions"
                sub="Questions you got wrong on the first attempt most often."
              >
                <div className="an-list">
                  {mostMissed.map((m) => (
                    <div className="an-row" key={m.text}>
                      <span className="an-row-main">{m.text}</span>
                      <span className="an-row-meta">
                        {m.count} miss{m.count === 1 ? '' : 'es'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {slowestRecent.length > 0 && (
              <Card
                title="Slowest recent questions"
                sub="The six longest single questions from your most recent quarter of sets."
              >
                <div className="an-list">
                  {slowestRecent.map((s, i) => (
                    <div className="an-row" key={`${s.text}-${s.date}-${i}`}>
                      <span className="an-row-main">
                        {s.text}{' '}
                        {s.carry !== null && <span className="an-badge">carry {s.carry}</span>}
                      </span>
                      <span className="an-row-meta">{fSec(s.sec)} · {fDate(s.date)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="an-note">
              All figures use first-attempt correctness and are computed on this device from your
              saved history.
            </div>
          </>
        )}
      </div>
    </>
  );
}
