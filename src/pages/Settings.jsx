import { useState, useRef, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import { AlertTriangle, Download, Upload, Trash2, X } from 'lucide-react';

const APP_VERSION = '1.0.0';

const HISTORY_PREFIX = 'mathWorkout_';
const SETTINGS_KEY = 'mathWorkoutSettings';
const KNOWN_SCALAR_KEYS = ['theme'];
const KNOWN_TABLE_KEYS = [
  'multiTables_selectedTables',
  'multiTables_selectedFactors',
  'multiTables_testType',
  'multiTables_timeSetting',
  'multiTables_questionsSetting',
];

/** localStorage stores strings; a backup may hold either a string or the parsed value. */
const asParsed = (value) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return value;
  try {
    return JSON.parse(t);
  } catch {
    return value;
  }
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Validates a parsed backup payload and describes exactly what importing it
 * would do. Returns { ok, errors, warnings, stats }.
 *
 * Scope stays universal — every key in the file is still written — but the
 * shape of the keys we know about is checked first, so a wrong file cannot
 * quietly shred the user's practice history.
 */
function inspectBackup(payload) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      errors: ['This file is not a KK’s Hub backup. Expected a JSON object at the top level.'],
      warnings,
      stats: null,
    };
  }

  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return { ok: false, errors: ['The backup file is empty — there is nothing to import.'], warnings, stats: null };
  }

  const historyKeys = keys.filter((k) => k.startsWith(HISTORY_PREFIX));
  const tableKeys = keys.filter((k) => KNOWN_TABLE_KEYS.includes(k));
  const hasSettings = keys.includes(SETTINGS_KEY);
  const recognised = historyKeys.length + tableKeys.length + (hasSettings ? 1 : 0) +
    KNOWN_SCALAR_KEYS.filter((k) => keys.includes(k)).length;

  // Shape checks on the keys this app owns.
  if (hasSettings && !isPlainObject(asParsed(payload[SETTINGS_KEY]))) {
    errors.push(`"${SETTINGS_KEY}" must be an object.`);
  }
  for (const k of historyKeys) {
    if (!Array.isArray(asParsed(payload[k]))) {
      errors.push(`History key "${k}" is not a list of sessions.`);
    }
  }
  for (const k of ['multiTables_selectedTables', 'multiTables_selectedFactors']) {
    if (keys.includes(k) && !Array.isArray(asParsed(payload[k]))) {
      errors.push(`"${k}" must be a list of numbers.`);
    }
  }
  for (const v of Object.values(payload)) {
    if (typeof v === 'function') errors.push('The file contains unsupported values.');
  }

  if (recognised === 0) {
    warnings.push(
      'None of the keys in this file are recognised as KK’s Hub data. It may be a backup from a different app.'
    );
  }

  // What already exists locally and would be replaced.
  const existingKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) existingKeys.push(k);
  }
  const overwritten = keys.filter((k) => existingKeys.includes(k));
  const added = keys.filter((k) => !existingKeys.includes(k));
  const untouched = existingKeys.filter((k) => !keys.includes(k));

  const localHistoryKeys = existingKeys.filter((k) => k.startsWith(HISTORY_PREFIX));
  const overwrittenHistory = overwritten.filter((k) => k.startsWith(HISTORY_PREFIX));

  let localSessions = 0;
  for (const k of overwrittenHistory) {
    try {
      const arr = JSON.parse(localStorage.getItem(k) || '[]');
      if (Array.isArray(arr)) localSessions += arr.length;
    } catch { /* ignore unreadable entries */ }
  }
  let incomingSessions = 0;
  for (const k of historyKeys) {
    const arr = asParsed(payload[k]);
    if (Array.isArray(arr)) incomingSessions += arr.length;
  }

  if (overwrittenHistory.length > 0) {
    warnings.push(
      `${overwrittenHistory.length} existing history record${overwrittenHistory.length === 1 ? '' : 's'} ` +
      `(${localSessions} saved session${localSessions === 1 ? '' : 's'}) will be REPLACED, not merged.`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalKeys: keys.length,
      historyKeys: historyKeys.length,
      incomingSessions,
      overwritten: overwritten.length,
      added: added.length,
      untouched: untouched.length,
      settingsReplaced: hasSettings && existingKeys.includes(SETTINGS_KEY),
      localHistoryKeys: localHistoryKeys.length,
    },
  };
}

/** Escape to close, backdrop click to close, scroll lock, focus in and restored. */
function Modal({ title, onClose, children, footer }) {
  const cardRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    document.body.classList.add('modal-open');

    const card = cardRef.current;
    if (card) {
      const first = card.querySelector('input:not([disabled]), button:not([disabled])');
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
      );
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
        className="mw-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="mw-modal-header">
          <h2>{title}</h2>
          <button type="button" className="mw-icon-btn" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="mw-modal-body">{children}</div>
        <div className="mw-modal-footer">{footer}</div>
      </div>
    </div>
  );
}

const selectStyle = {
  border: 'none',
  background: 'transparent',
  fontSize: '1rem',
  outline: 'none',
  color: 'inherit',
  minHeight: '44px',
};

export default function Settings({ settings, updateSetting }) {
  const fileInputRef = useRef(null);
  const [pending, setPending] = useState(null); // { fileName, payload, report }
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTyped, setResetTyped] = useState('');
  const [toast, setToast] = useState(null);

  const closePending = useCallback(() => {
    setPending(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const closeReset = useCallback(() => {
    setResetOpen(false);
    setResetTyped('');
  }, []);

  const exportData = () => {
    const exportObj = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        try {
          const val = localStorage.getItem(key);
          exportObj[key] = val.startsWith('{') || val.startsWith('[') ? JSON.parse(val) : val;
        } catch {
          exportObj[key] = localStorage.getItem(key);
        }
      }
    }
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportObj, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'kks_hub_backup.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setToast('Backup downloaded.');
  };

  // Step 1 of import: parse + validate, then show the confirmation dialog.
  // Nothing is written to localStorage here.
  const stageImport = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => {
      setPending({
        fileName: file.name,
        payload: null,
        report: { ok: false, errors: ['The file could not be read.'], warnings: [], stats: null },
      });
    };
    reader.onload = (e) => {
      let payload = null;
      let report;
      try {
        payload = JSON.parse(e.target.result);
        report = inspectBackup(payload);
      } catch {
        report = {
          ok: false,
          errors: ['This is not valid JSON, so it cannot be a KK’s Hub backup.'],
          warnings: [],
          stats: null,
        };
      }
      setPending({ fileName: file.name, payload, report });
    };
    reader.readAsText(file);
  };

  // Step 2: the user has read what will change and confirmed.
  const applyImport = () => {
    if (!pending || !pending.report.ok || !pending.payload) return;
    for (const [key, value] of Object.entries(pending.payload)) {
      if (value !== null && typeof value === 'object') {
        localStorage.setItem(key, JSON.stringify(value));
      } else {
        localStorage.setItem(key, String(value));
      }
    }
    window.location.reload();
  };

  const historyKeyCount = (() => {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(HISTORY_PREFIX)) n++;
    }
    return n;
  })();

  const applyReset = () => {
    if (resetTyped.trim().toUpperCase() !== 'DELETE') return;
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(HISTORY_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
    window.location.reload();
  };

  const stats = pending && pending.report.stats;

  return (
    <>
      <Header title="Settings" backTo="/" />
      <div className="page-content">

        <h2 className="settings-section-title">Gameplay</h2>
        <div className="settings-list">

          <div className="settings-item">
            <span className="settings-label" id="difficulty-label">Difficulty</span>
            <div className="settings-value">
              <select
                aria-labelledby="difficulty-label"
                value={settings.difficulty}
                onChange={(e) => updateSetting('difficulty', e.target.value)}
                style={selectStyle}
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
                <option value="Challenging">Challenging</option>
                <option value="Expert">Expert</option>
              </select>
            </div>
          </div>
          <p className="settings-hint">
            The default difficulty for every mode. Any mode where you have picked a difficulty of
            its own keeps that setting and ignores this one.
          </p>

          <div className="settings-item" style={{ display: 'block' }}>
            <span className="settings-label" id="questions-label" style={{ display: 'block', marginBottom: '0.75rem' }}>
              Questions per round
            </span>
            <div className="seg-group" role="group" aria-labelledby="questions-label">
              {[10, 20, 40].map((num) => (
                <button
                  key={num}
                  type="button"
                  className="seg-btn"
                  aria-pressed={settings.questions === num}
                  onClick={() => updateSetting('questions', num)}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-item">
            <span className="settings-label" id="sounds-label">Sounds</span>
            <label className="switch">
              <input
                type="checkbox"
                aria-labelledby="sounds-label"
                checked={!!settings.sounds}
                onChange={(e) => updateSetting('sounds', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          <div className="settings-item">
            <span className="settings-label" id="displaytime-label">Display Time</span>
            <label className="switch">
              <input
                type="checkbox"
                aria-labelledby="displaytime-label"
                checked={!!settings.displayTime}
                onChange={(e) => updateSetting('displayTime', e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

        </div>

        <h2 className="settings-section-title">Appearance</h2>
        <div className="settings-list">

          <div className="settings-item">
            <span className="settings-label" id="theme-label">Theme</span>
            <div className="settings-value">
              <select
                aria-labelledby="theme-label"
                value={settings.theme || 'default'}
                onChange={(e) => updateSetting('theme', e.target.value)}
                style={selectStyle}
              >
                <option value="default">Default</option>
                <option value="dark">Dark Mode</option>
                <option value="forest">Forest</option>
                <option value="sunset">Sunset</option>
                <option value="purple">Purple</option>
                <option value="nothing-light">Nothing (Light)</option>
              </select>
            </div>
          </div>

          <div className="settings-item">
            <span className="settings-label" id="keyboard-label">Keyboard Size</span>
            <div className="settings-value">
              <select
                aria-labelledby="keyboard-label"
                value={settings.keyboardSize || 'Medium'}
                onChange={(e) => updateSetting('keyboardSize', e.target.value)}
                style={selectStyle}
              >
                <option value="Small">Small</option>
                <option value="Medium">Medium</option>
                <option value="Large">Large</option>
              </select>
            </div>
          </div>

        </div>

        <h2 className="settings-section-title">Data</h2>
        <div className="settings-list">
          <div className="settings-item" style={{ display: 'block' }}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={exportData}>
                <Download size={18} aria-hidden="true" /> Export
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
              >
                <Upload size={18} aria-hidden="true" /> Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={stageImport}
              />
            </div>
            <p className="settings-hint" style={{ padding: '0.75rem 0 0', marginTop: 0 }}>
              Universal backup: saves and restores every setting and all history across the whole
              KK&rsquo;s Hub. Importing asks you to confirm before anything is replaced.
            </p>
          </div>

          <div className="settings-item" style={{ display: 'block' }}>
            <button
              type="button"
              className="btn-secondary btn-danger"
              style={{ width: '100%' }}
              onClick={() => setResetOpen(true)}
              disabled={historyKeyCount === 0}
            >
              <Trash2 size={18} aria-hidden="true" /> Reset all history
            </button>
            <p className="settings-hint" style={{ padding: '0.75rem 0 0', marginTop: 0 }}>
              {historyKeyCount === 0
                ? 'No practice history saved yet.'
                : `Permanently deletes all ${historyKeyCount} saved practice record${historyKeyCount === 1 ? '' : 's'}. Your settings are kept. Export a backup first if you might want this back.`}
            </p>
          </div>
        </div>

        <p className="settings-note" style={{ marginBottom: '1rem' }}>
          Math Workout v{APP_VERSION}
        </p>

        {toast && (
          <p className="settings-note" role="status" style={{ marginBottom: '1rem' }}>
            {toast}
          </p>
        )}
      </div>

      {pending && (
        <Modal
          title={pending.report.ok ? 'Confirm import' : 'Cannot import this file'}
          onClose={closePending}
          footer={
            pending.report.ok ? (
              <>
                <button type="button" className="btn-secondary" onClick={closePending}>Cancel</button>
                <button type="button" className="btn-secondary btn-danger" onClick={applyImport}>
                  Overwrite and import
                </button>
              </>
            ) : (
              <button type="button" className="btn-secondary" onClick={closePending}>Close</button>
            )
          }
        >
          <p style={{ marginBottom: '0.75rem', wordBreak: 'break-all' }}>
            <strong>{pending.fileName}</strong>
          </p>

          {pending.report.errors.map((msg, i) => (
            <div className="mw-callout warn" key={`e${i}`} role="alert">
              <AlertTriangle size={18} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: '2px' }} />
              <span>{msg}</span>
            </div>
          ))}

          {pending.report.ok && pending.report.warnings.map((msg, i) => (
            <div className="mw-callout warn" key={`w${i}`}>
              <AlertTriangle size={18} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: '2px' }} />
              <span>{msg}</span>
            </div>
          ))}

          {pending.report.ok && stats && (
            <>
              <div className="mw-kv"><span>Entries in file</span><span>{stats.totalKeys}</span></div>
              <div className="mw-kv"><span>History records in file</span><span>{stats.historyKeys}</span></div>
              <div className="mw-kv"><span>Saved sessions in file</span><span>{stats.incomingSessions}</span></div>
              <div className="mw-kv"><span>Existing entries replaced</span><span>{stats.overwritten}</span></div>
              <div className="mw-kv"><span>New entries added</span><span>{stats.added}</span></div>
              <div className="mw-kv"><span>Existing entries left alone</span><span>{stats.untouched}</span></div>
              <div className="mw-kv">
                <span>App settings replaced</span>
                <span>{stats.settingsReplaced ? 'Yes' : 'No'}</span>
              </div>
              <p className="settings-note" style={{ textAlign: 'left', padding: '0.75rem 0 0' }}>
                This cannot be undone. The app will reload once the import finishes.
              </p>
            </>
          )}
        </Modal>
      )}

      {resetOpen && (
        <Modal
          title="Reset all history"
          onClose={closeReset}
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={closeReset}>Cancel</button>
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={applyReset}
                disabled={resetTyped.trim().toUpperCase() !== 'DELETE'}
              >
                Delete history
              </button>
            </>
          }
        >
          <div className="mw-callout warn">
            <AlertTriangle size={18} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: '2px' }} />
            <span>
              This permanently deletes all {historyKeyCount} saved practice record
              {historyKeyCount === 1 ? '' : 's'} and every score in them. It cannot be undone.
            </span>
          </div>
          <p style={{ marginBottom: '0.5rem' }}>
            Your settings, themes and table selections are kept. To continue, type{' '}
            <strong>DELETE</strong> below.
          </p>
          <input
            className="mw-confirm-input"
            type="text"
            value={resetTyped}
            onChange={(e) => setResetTyped(e.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
          />
        </Modal>
      )}
    </>
  );
}
