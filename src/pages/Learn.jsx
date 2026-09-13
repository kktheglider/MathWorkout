import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { LEARNABLE_MODES } from '../utils/modes';
import { EXPONENT_POWERS, readExponentPower } from '../utils/exponents';

/*
 * The Learn reference must cover everything Practice can ask (Game.jsx ranges
 * are frozen):
 *   Multiplication Tables - base tables 2..50, factors 1..50 (see
 *                           MultiplicationTablesSettings.jsx pickers)
 *   Square Root           - n = 1..999 (Expert draws 317..999)
 *   Cube Root             - n = 1..99  (Expert draws 71..99)
 *   Math Exponents        - n = 1..999, power taken from mathExponents_power
 * Lists are chunked (50 rows at a time) with a jump-to search so a phone never
 * renders a thousand rows.
 */
const CHUNK_SIZE = 50;

const SQRT_MAX = 999;
const CBRT_MAX = 99;
const EXPONENT_MAX = 999;
const TABLE_MIN = 2;
const TABLE_MAX = 50;
const FACTOR_MAX = 50;

const SUPERSCRIPT = { '2': '²', '3': '³', '4': '⁴', '5': '⁵' };

const focusCss = `
.learn-focusable:focus-visible {
  outline: 3px solid var(--secondary-color);
  outline-offset: 2px;
}
.learn-row:last-child {
  border-bottom: none !important;
}
`;

const cardStyle = {
  background: 'var(--surface-color)',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: 'var(--shadow-md)',
  border: '1px solid var(--border-color)'
};

const noteStyle = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginBottom: '0.75rem'
};

const controlStyle = {
  minHeight: '44px',
  padding: '0.5rem 0.75rem',
  borderRadius: '8px',
  border: '1px solid var(--border-dark)',
  background: 'var(--surface-color)',
  color: 'var(--text-primary)',
  fontSize: '1rem',
  fontFamily: 'inherit',
  cursor: 'pointer'
};

const MAX_SEARCH_RESULTS = 60;

/**
 * A chunked, searchable reference list.
 * rowFor(n) -> { left, right, tokens } where tokens are the numeric strings a
 * user might type to find this row.
 */
function ReferenceList({ max, rowFor, searchLabel, searchPlaceholder, chunkLabel }) {
  const [chunk, setChunk] = useState(0);
  const [query, setQuery] = useState('');

  const chunkCount = Math.ceil(max / CHUNK_SIZE);
  const safeChunk = Math.min(chunk, chunkCount - 1);
  const trimmed = query.replace(/[^0-9]/g, '');

  const rows = useMemo(() => {
    const out = [];
    if (trimmed) {
      for (let n = 1; n <= max && out.length < MAX_SEARCH_RESULTS; n++) {
        const row = rowFor(n);
        if (row.tokens.some(t => t.startsWith(trimmed))) out.push({ n, ...row });
      }
      return out;
    }
    const start = safeChunk * CHUNK_SIZE + 1;
    const end = Math.min(max, start + CHUNK_SIZE - 1);
    for (let n = start; n <= end; n++) out.push({ n, ...rowFor(n) });
    return out;
  }, [trimmed, safeChunk, max, rowFor]);

  const start = safeChunk * CHUNK_SIZE + 1;
  const end = Math.min(max, start + CHUNK_SIZE - 1);

  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <input
          type="search"
          inputMode="numeric"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          className="learn-focusable"
          style={{ ...controlStyle, flex: '1 1 140px', minWidth: 0, cursor: 'text' }}
        />
        {query && (
          <button
            type="button"
            className="learn-focusable"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            style={{ ...controlStyle, minWidth: '44px' }}
          >
            ×
          </button>
        )}
      </div>

      {!trimmed && chunkCount > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'stretch' }}>
          <button
            type="button"
            className="learn-focusable"
            aria-label="Previous range"
            disabled={safeChunk === 0}
            onClick={() => setChunk(c => Math.max(0, c - 1))}
            style={{ ...controlStyle, minWidth: '44px', opacity: safeChunk === 0 ? 0.4 : 1 }}
          >
            ‹
          </button>
          <select
            value={safeChunk}
            onChange={e => setChunk(Number(e.target.value))}
            aria-label="Jump to range"
            className="learn-focusable"
            style={{ ...controlStyle, flex: 1, minWidth: 0 }}
          >
            {Array.from({ length: chunkCount }, (_, i) => {
              const s = i * CHUNK_SIZE + 1;
              const e = Math.min(max, s + CHUNK_SIZE - 1);
              return <option key={i} value={i}>{chunkLabel(s, e)}</option>;
            })}
          </select>
          <button
            type="button"
            className="learn-focusable"
            aria-label="Next range"
            disabled={safeChunk >= chunkCount - 1}
            onClick={() => setChunk(c => Math.min(chunkCount - 1, c + 1))}
            style={{ ...controlStyle, minWidth: '44px', opacity: safeChunk >= chunkCount - 1 ? 0.4 : 1 }}
          >
            ›
          </button>
        </div>
      )}

      <div style={{ ...noteStyle, marginBottom: '0.5rem' }} aria-live="polite">
        {trimmed
          ? `${rows.length === 0 ? 'No' : rows.length}${rows.length === MAX_SEARCH_RESULTS ? '+' : ''} match${rows.length === 1 ? '' : 'es'} for "${trimmed}"`
          : chunkLabel(start, end)}
      </div>

      <div style={cardStyle}>
        {rows.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>
            Nothing in this reference matches that number.
          </div>
        )}
        {rows.map(row => (
          <div
            key={row.n}
            className="learn-row"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: '1rem',
              padding: '0.75rem 0',
              borderBottom: '1px solid var(--border-color)',
              fontSize: '1.25rem'
            }}
          >
            <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{row.left}</span>
            <span style={{ fontWeight: 600, color: 'var(--primary-color)', textAlign: 'right', wordBreak: 'break-all' }}>
              {row.right}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Accessible table picker modal: Escape closes, focus is trapped and
 *  restored, and the page behind it does not scroll. */
function TablePickerModal({ open, selected, onSelect, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
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
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const scroller = document.querySelector('.page-content');
    const prevBodyOverflow = document.body.style.overflow;
    const prevScrollerOverflow = scroller ? scroller.style.overflowY : null;
    document.body.style.overflow = 'hidden';
    if (scroller) scroller.style.overflowY = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      if (scroller) scroller.style.overflowY = prevScrollerOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '1rem'
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-table-picker-title"
        style={{
          background: 'var(--surface-color)', borderRadius: '12px', width: '100%',
          maxWidth: '400px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border-color)'
        }}
      >
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="learn-table-picker-title" style={{ fontSize: '1.2rem', fontWeight: 500, color: 'var(--text-primary)' }}>Select Table</h2>
          <button
            ref={closeRef}
            type="button"
            className="learn-focusable"
            onClick={onClose}
            aria-label="Close table picker"
            style={{
              background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer',
              color: 'var(--text-secondary)', minWidth: '44px', minHeight: '44px', borderRadius: '8px'
            }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          {Array.from({ length: TABLE_MAX - TABLE_MIN + 1 }, (_, i) => i + TABLE_MIN).map(num => {
            const isSelected = selected === num;
            return (
              <button
                key={num}
                type="button"
                className="learn-focusable"
                aria-label={`Table of ${num}`}
                aria-pressed={isSelected}
                onClick={() => onSelect(num)}
                style={{
                  minHeight: '48px', padding: '0.75rem 0.25rem', borderRadius: '8px',
                  fontSize: '1.1rem', fontWeight: 500, fontFamily: 'inherit',
                  border: '1px solid var(--secondary-color)',
                  background: isSelected ? 'var(--secondary-color)' : 'var(--surface-color)',
                  color: isSelected ? 'var(--text-light)' : 'var(--secondary-color)',
                  cursor: 'pointer'
                }}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Learn() {
  const { mode } = useParams();
  const navigate = useNavigate();

  const [selectedTable, setSelectedTable] = useState(TABLE_MIN);
  const [modalOpen, setModalOpen] = useState(false);
  const [exponentPower, setExponentPower] = useState(readExponentPower);

  // Learn opens on whatever power the menu persisted, and changing it here
  // keeps the two screens (and Game.jsx) in agreement.
  useEffect(() => {
    /* Learn is a reference table: browsing a power here must not silently
       change what Practice drills. The menu is the only writer. */
  }, [mode, exponentPower]);

  const tableRow = useCallback((n) => ({
    left: `${selectedTable} × ${n}`,
    right: selectedTable * n,
    tokens: [String(n), String(selectedTable * n)]
  }), [selectedTable]);

  const sqrtRow = useCallback((n) => ({
    left: `√${n * n}`,
    right: `= ${n}`,
    tokens: [String(n), String(n * n)]
  }), []);

  const cbrtRow = useCallback((n) => ({
    left: `∛${n * n * n}`,
    right: `= ${n}`,
    tokens: [String(n), String(n * n * n)]
  }), []);

  const exponentRow = useCallback((n) => {
    const value = Math.pow(n, Number(exponentPower));
    return {
      left: <>{n}<sup>{exponentPower}</sup></>,
      right: `= ${value}`,
      tokens: [String(n), String(value)]
    };
  }, [exponentPower]);

  const renderMultiplicationTable = () => (
    <div style={{ padding: '1rem', paddingBottom: '2rem' }}>
      <button
        type="button"
        className="learn-focusable"
        onClick={() => setModalOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Change table. Currently showing the table of ${selectedTable}`}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          width: '100%', textAlign: 'left', fontFamily: 'inherit',
          background: 'var(--surface-color)', padding: '1rem 1.5rem', borderRadius: '12px',
          marginBottom: '1rem', boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
          border: '1px solid var(--border-color)', minHeight: '56px'
        }}
      >
        <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>Table of {selectedTable}</span>
        <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>Change ▼</span>
      </button>

      <TablePickerModal
        open={modalOpen}
        selected={selectedTable}
        onSelect={(num) => { setSelectedTable(num); setModalOpen(false); }}
        onClose={() => setModalOpen(false)}
      />

      <p style={noteStyle}>
        Tables {TABLE_MIN}–{TABLE_MAX} × factors 1–{FACTOR_MAX} — the same range Practice can ask.
      </p>

      <ReferenceList
        max={FACTOR_MAX}
        rowFor={tableRow}
        searchLabel="Search this table by factor or answer"
        searchPlaceholder="Search factor or answer"
        chunkLabel={(s, e) => `× ${s}–${e}`}
      />
    </div>
  );

  const renderSquareRoot = () => (
    <div style={{ padding: '1rem', paddingBottom: '2rem' }}>
      <p style={noteStyle}>
        √1 to √{(SQRT_MAX * SQRT_MAX).toLocaleString()} (n = 1–{SQRT_MAX}) — covers every difficulty up to Expert.
      </p>
      <ReferenceList
        max={SQRT_MAX}
        rowFor={sqrtRow}
        searchLabel="Search by root or square"
        searchPlaceholder="Search e.g. 144 or 12"
        chunkLabel={(s, e) => `n = ${s}–${e}`}
      />
    </div>
  );

  const renderCubeRoot = () => (
    <div style={{ padding: '1rem', paddingBottom: '2rem' }}>
      <p style={noteStyle}>
        ∛1 to ∛{(CBRT_MAX ** 3).toLocaleString()} (n = 1–{CBRT_MAX}) — covers every difficulty up to Expert.
      </p>
      <ReferenceList
        max={CBRT_MAX}
        rowFor={cbrtRow}
        searchLabel="Search by root or cube"
        searchPlaceholder="Search e.g. 1728 or 12"
        chunkLabel={(s, e) => `n = ${s}–${e}`}
      />
    </div>
  );

  const renderExponents = () => (
    <div style={{ padding: '1rem', paddingBottom: '2rem' }}>
      <div
        className="hide-scrollbar"
        role="group"
        aria-label="Power"
        style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '1rem', marginBottom: '0.25rem' }}
      >
        {EXPONENT_POWERS.map(power => {
          const active = exponentPower === power;
          return (
            <button
              key={power}
              type="button"
              className="learn-focusable"
              aria-pressed={active}
              aria-label={`Power of ${power}`}
              onClick={() => setExponentPower(power)}
              style={{
                minHeight: '44px',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid ' + (active ? 'var(--primary-color)' : 'var(--border-dark)'),
                background: active ? 'var(--primary-color)' : 'var(--surface-color)',
                color: active ? 'var(--on-primary)' : 'var(--text-primary)',
                fontWeight: 600,
                fontFamily: 'inherit',
                fontSize: '1rem',
                boxShadow: 'var(--shadow-sm)',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              Power of {power}
            </button>
          );
        })}
      </div>

      <p style={noteStyle}>
        Practice will ask you for n{SUPERSCRIPT[exponentPower]} — this is the power saved on the
        Math Exponents menu. n = 1–{EXPONENT_MAX}.
      </p>

      <ReferenceList
        max={EXPONENT_MAX}
        rowFor={exponentRow}
        searchLabel="Search by base or result"
        searchPlaceholder="Search base or result"
        chunkLabel={(s, e) => `n = ${s}–${e}`}
      />
    </div>
  );

  const renderUnknown = () => (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <div style={{ ...cardStyle, padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '0.75rem' }}>
          No study notes for this mode
        </h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          {mode ? `"${mode}" ` : 'This mode '}
          has no reference tables — its questions are generated fresh every round, so there is
          nothing fixed to memorise. Pick a mode from the home screen to practise it.
        </p>
        <button
          className="btn-primary learn-focusable"
          style={{ marginBottom: 0 }}
          onClick={() => navigate('/')}
        >
          Back to Home
        </button>
      </div>
    </div>
  );

  const supported = LEARNABLE_MODES.includes(mode);

  return (
    <>
      <style>{focusCss}</style>
      <Header
        title={supported ? `Learn ${mode}` : 'Learn'}
        backTo={supported ? `/menu/${encodeURIComponent(mode)}` : '/'}
      />
      <div className="page-content" style={{ padding: 0 }}>
        {mode === 'Multiplication Tables' && renderMultiplicationTable()}
        {mode === 'Square Root' && renderSquareRoot()}
        {mode === 'Cube Root' && renderCubeRoot()}
        {mode === 'Math Exponents' && renderExponents()}
        {!supported && renderUnknown()}
      </div>
    </>
  );
}
