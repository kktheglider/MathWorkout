import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { Check, X, AlertTriangle } from 'lucide-react';

const TABLE_NUMBERS = Array.from({ length: 49 }, (_, i) => i + 2);   // 2..50
const FACTOR_NUMBERS = Array.from({ length: 50 }, (_, i) => i + 1);  // 1..50

/* Agent 2's Game.jsx builds the Practice Mistakes pool from previously-missed
   facts and falls back to normal generation below 5 distinct ones. We must not
   offer a button that quietly lands the user in that fallback, so the button is
   only enabled once 5 distinct missed facts actually exist. */
const MIN_MISTAKES_TO_PRACTICE = 5;

/* The stored value stays 'all' — Game.jsx, Results.jsx and the history bucket
   keys all depend on it. Only the label changes, and it has to match what
   Results.jsx shows ("All (100 Questions)") so one setting does not read as two
   different things on two screens. */
const questionLabel = (value) => (value === 'all' ? 'All (100)' : value);

/**
 * Scans every `mathWorkout_Multiplication Tables_*` history key and returns the
 * set of distinct question texts the user needed more than one attempt on.
 * Defensive throughout: history written by older builds may be any shape.
 */
function countDistinctMissedFacts() {
  const facts = new Set();
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
      for (const record of records) {
        const details = record && record.details;
        if (!Array.isArray(details)) continue;
        for (const d of details) {
          if (!d || !Array.isArray(d.attempts) || d.attempts.length <= 1) continue;
          /* Must match the pool builder in Game.jsx exactly: a fact it cannot
             parse is a fact it cannot drill, so counting it here would unlock
             the button onto a silent fallback. */
          const m = /^s*(d+)s*[×xX*]s*(d+)s*$/.exec(String(d.questionText || ''));
          if (m) facts.add(`${m[1]}x${m[2]}`);
        }
      }
    }
  } catch {
    /* localStorage unavailable — treat as "no mistakes recorded" */
  }
  return facts.size;
}

/**
 * Accessible dialog: Escape to close, backdrop click to close, body scroll
 * lock, focus moved in on open and restored to the trigger on close, and Tab
 * kept inside the dialog.
 */
function Modal({ titleId, title, onClose, children, footer, narrow }) {
  const cardRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    document.body.classList.add('modal-open');

    const card = cardRef.current;
    if (card) {
      const first = card.querySelector(
        'button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
      );
      (first || card).focus();
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusable = Array.from(
        cardRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.classList.remove('modal-open');
      const el = restoreFocusRef.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, [onClose]);

  return (
    <div
      className="mw-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className={`mw-modal${narrow ? ' narrow' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="mw-modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="mw-icon-btn" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

/** Grid of toggleable numbers with select-all / clear and a live count. */
function NumberPicker({ legend, numbers, selected, onToggle, onSelectAll, onClear }) {
  return (
    <>
      <div className="mw-num-toolbar">
        <button type="button" className="btn-secondary" onClick={onSelectAll}>
          Select all
        </button>
        <button type="button" className="btn-secondary" onClick={onClear}>
          Clear
        </button>
      </div>
      <p className="mw-selection-count" aria-live="polite">
        {selected.length} of {numbers.length} selected
      </p>
      <div className="mw-modal-body">
        <div className="mw-num-grid" role="group" aria-label={legend}>
          {numbers.map((num) => {
            const isSelected = selected.includes(num);
            return (
              <button
                key={num}
                type="button"
                className="mw-num-btn"
                aria-pressed={isSelected}
                aria-label={`${num}${isSelected ? ', selected' : ''}`}
                onClick={() => onToggle(num)}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default function MultiplicationTablesSettings() {
  const navigate = useNavigate();
  const [modal, setModal] = useState(null); // 'tables' | 'factors' | 'time' | 'questions'

  const [selectedTables, setSelectedTables] = useState(() => {
    const saved = localStorage.getItem('multiTables_selectedTables');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedFactors, setSelectedFactors] = useState(() => {
    const saved = localStorage.getItem('multiTables_selectedFactors');
    return saved ? JSON.parse(saved) : [2, 3, 4, 5, 6, 7, 8, 9, 10];
  });
  const [testType, setTestType] = useState(() => {
    return localStorage.getItem('multiTables_testType') || 'time';
  });
  const [timeSetting, setTimeSetting] = useState(() => {
    return localStorage.getItem('multiTables_timeSetting') || '1 Minute';
  });
  const [questionsSetting, setQuestionsSetting] = useState(() => {
    return localStorage.getItem('multiTables_questionsSetting') || '10';
  });

  // Storage schema unchanged — same five keys, same values.
  useEffect(() => {
    localStorage.setItem('multiTables_selectedTables', JSON.stringify(selectedTables));
    localStorage.setItem('multiTables_selectedFactors', JSON.stringify(selectedFactors));
    localStorage.setItem('multiTables_testType', testType);
    localStorage.setItem('multiTables_timeSetting', timeSetting);
    localStorage.setItem('multiTables_questionsSetting', questionsSetting);
  }, [selectedTables, selectedFactors, testType, timeSetting, questionsSetting]);

  const missedFactCount = useMemo(() => countDistinctMissedFacts(), []);
  const canPracticeMistakes = missedFactCount >= MIN_MISTAKES_TO_PRACTICE;

  const toggleTable = (num) =>
    setSelectedTables((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );

  const toggleFactor = (num) =>
    setSelectedFactors((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    );

  const closeModal = useCallback(() => setModal(null), []);

  const summarise = (list) => {
    if (list.length === 0) return 'None';
    const sorted = [...list].sort((a, b) => a - b);
    return sorted.slice(0, 4).join(', ') + (sorted.length > 4 ? ',...' : '');
  };

  const tablesEmpty = selectedTables.length === 0;
  const factorsEmpty = selectedFactors.length === 0;
  const canStart = !tablesEmpty && !factorsEmpty;

  const startMessage = tablesEmpty && factorsEmpty
    ? 'Pick at least one base table and one multiplication factor before starting.'
    : tablesEmpty
      ? 'Pick at least one base table before starting.'
      : factorsEmpty
        ? 'Pick at least one multiplication factor before starting.'
        : null;

  const gameState = {
    selectedTables,
    selectedFactors,
    testType,
    timeSetting,
    questionsSetting,
  };

  const start = () => {
    if (!canStart) return;
    navigate('/game/Multiplication%20Tables', { state: gameState });
  };

  const startPracticeMistakes = () => {
    if (!canPracticeMistakes) return;
    navigate('/game/Multiplication%20Tables', {
      state: { ...gameState, practiceMistakes: true },
    });
  };

  return (
    <>
      <Header title="Multiplication Tables" backTo="/multiplication-tables" />
      <div className="page-content">
        <div className="settings-list">

          <button
            type="button"
            className="settings-item settings-item-btn"
            onClick={() => setModal('tables')}
          >
            <span className="settings-label">Base Tables</span>
            <span className="settings-value" style={tablesEmpty ? { color: 'var(--error-color)' } : undefined}>
              {summarise(selectedTables)}
              <span aria-hidden="true" style={{ fontSize: '0.8rem' }}>▼</span>
            </span>
          </button>

          <button
            type="button"
            className="settings-item settings-item-btn"
            onClick={() => setModal('factors')}
          >
            <span className="settings-label">Multiplication Factors</span>
            <span className="settings-value" style={factorsEmpty ? { color: 'var(--error-color)' } : undefined}>
              {summarise(selectedFactors)}
              <span aria-hidden="true" style={{ fontSize: '0.8rem' }}>▼</span>
            </span>
          </button>

          <div role="radiogroup" aria-label="Test type">
            <label className="settings-item" style={{ cursor: 'pointer', gap: '10px', justifyContent: 'flex-start' }}>
              <input
                type="radio"
                className="mw-radio"
                name="testType"
                value="time"
                checked={testType === 'time'}
                onChange={() => setTestType('time')}
              />
              <span className="settings-label">Time</span>
            </label>
            <label className="settings-item" style={{ cursor: 'pointer', gap: '10px', justifyContent: 'flex-start' }}>
              <input
                type="radio"
                className="mw-radio"
                name="testType"
                value="questions"
                checked={testType === 'questions'}
                onChange={() => setTestType('questions')}
              />
              <span className="settings-label">Number of questions</span>
            </label>
          </div>

          {testType === 'time' && (
            <button
              type="button"
              className="settings-item settings-item-btn settings-subitem"
              onClick={() => setModal('time')}
            >
              <span className="settings-label">Time</span>
              <span className="settings-value">
                {timeSetting}
                <span aria-hidden="true" style={{ fontSize: '0.8rem' }}>▼</span>
              </span>
            </button>
          )}

          {testType === 'questions' && (
            <button
              type="button"
              className="settings-item settings-item-btn settings-subitem"
              onClick={() => setModal('questions')}
            >
              <span className="settings-label">Number of questions</span>
              <span className="settings-value">
                {questionLabel(questionsSetting)}
                <span aria-hidden="true" style={{ fontSize: '0.8rem' }}>▼</span>
              </span>
            </button>
          )}

        </div>

        {startMessage && (
          <div className="mw-callout warn" role="alert">
            <AlertTriangle size={18} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: '2px' }} />
            <span>{startMessage}</span>
          </div>
        )}

        {!canPracticeMistakes && (
          <div className="mw-callout info">
            <span>
              {missedFactCount === 0
                ? 'Practice Mistakes unlocks once you have missed some questions — finish a round first.'
                : `Practice Mistakes needs ${MIN_MISTAKES_TO_PRACTICE} different missed facts to build a set. You have ${missedFactCount} so far.`}
            </span>
          </div>
        )}

        <button
          type="button"
          className="btn-primary"
          style={{ marginBottom: '1rem', background: 'var(--secondary-color)' }}
          onClick={startPracticeMistakes}
          disabled={!canPracticeMistakes}
          title={canPracticeMistakes ? `Practise ${missedFactCount} facts you have missed before` : undefined}
        >
          Practice Mistakes
        </button>

        <button
          type="button"
          className="btn-primary"
          onClick={start}
          disabled={!canStart}
        >
          Start
        </button>
      </div>

      {modal === 'tables' && (
        <Modal
          titleId="tables-modal-title"
          title="Base Tables"
          onClose={closeModal}
          footer={
            <div className="mw-modal-footer" style={{ display: 'block' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={closeModal}
                style={{ margin: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
              >
                <Check aria-hidden="true" />
                <span className="sr-only">Done</span>
              </button>
            </div>
          }
        >
          <NumberPicker
            legend="Base tables"
            numbers={TABLE_NUMBERS}
            selected={selectedTables}
            onToggle={toggleTable}
            onSelectAll={() => setSelectedTables([...TABLE_NUMBERS])}
            onClear={() => setSelectedTables([])}
          />
        </Modal>
      )}

      {modal === 'factors' && (
        <Modal
          titleId="factors-modal-title"
          title="Multiplication Factors"
          onClose={closeModal}
          footer={
            <div className="mw-modal-footer" style={{ display: 'block' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={closeModal}
                style={{ margin: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
              >
                <Check aria-hidden="true" />
                <span className="sr-only">Done</span>
              </button>
            </div>
          }
        >
          <NumberPicker
            legend="Multiplication factors"
            numbers={FACTOR_NUMBERS}
            selected={selectedFactors}
            onToggle={toggleFactor}
            onSelectAll={() => setSelectedFactors([...FACTOR_NUMBERS])}
            onClear={() => setSelectedFactors([])}
          />
        </Modal>
      )}

      {modal === 'time' && (
        <Modal
          titleId="time-modal-title"
          title="Time"
          onClose={closeModal}
          narrow
          footer={
            <div className="mw-modal-footer">
              <button type="button" className="btn-secondary" onClick={closeModal}>Done</button>
            </div>
          }
        >
          <div className="mw-modal-body">
            <div role="radiogroup" aria-label="Test length in minutes">
              {[1, 2, 3, 4, 5, 6].map((min) => {
                const label = `${min} Minute${min > 1 ? 's' : ''}`;
                return (
                  <label key={min} className="mw-radio-row">
                    <input
                      type="radio"
                      className="mw-radio"
                      name="timeSetting"
                      checked={timeSetting === label}
                      onChange={() => setTimeSetting(label)}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {modal === 'questions' && (
        <Modal
          titleId="questions-modal-title"
          title="Number of questions"
          onClose={closeModal}
          narrow
          footer={
            <div className="mw-modal-footer">
              <button type="button" className="btn-secondary" onClick={closeModal}>Done</button>
            </div>
          }
        >
          <div className="mw-modal-body">
            <div role="radiogroup" aria-label="Number of questions">
              {['10', '20', '30', '40', 'all'].map((opt) => (
                <label key={opt} className="mw-radio-row">
                  <input
                    type="radio"
                    className="mw-radio"
                    name="questionsSetting"
                    checked={questionsSetting === opt}
                    onChange={() => setQuestionsSetting(opt)}
                  />
                  {questionLabel(opt)}
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
