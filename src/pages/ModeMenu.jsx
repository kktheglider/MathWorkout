import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import { Zap, BookOpen, ChevronRight } from 'lucide-react';
import { LEARNABLE_MODES } from '../utils/modes';
import {
  EXPONENT_POWERS,
  allowedExponentPowers,
  maxExponentPower,
  readModeDifficulty,
  readExponentPower,
  writeExponentPower
} from '../utils/exponents';


const focusCss = `
.mode-menu-focusable:focus-visible,
.mode-menu-power:focus-visible {
  outline: 3px solid var(--secondary-color);
  outline-offset: 2px;
}
`;

export default function ModeMenu() {
  const { mode } = useParams();
  const navigate = useNavigate();

  const isExponents = mode === 'Math Exponents';
  const hasLearn = LEARNABLE_MODES.includes(mode);

  const difficulty = readModeDifficulty(mode);
  const powerChoices = allowedExponentPowers(difficulty);
  const [power, setPower] = useState(() => readExponentPower(difficulty));

  // Persist the drilled power so Game.jsx and Learn.jsx agree with this screen.
  useEffect(() => {
    if (isExponents) writeExponentPower(power);
  }, [isExponents, power]);

  // Difficulty can be changed on the Results screen after a power was picked,
  // so re-clamp whenever this screen is shown.
  useEffect(() => {
    if (isExponents && Number(power) > maxExponentPower(difficulty)) {
      setPower(String(maxExponentPower(difficulty)));
    }
  }, [isExponents, power, difficulty]);

  const handlePractice = () => {
    if (mode === 'Multiplication Tables') {
      navigate('/multiplication-tables/practice');
    } else {
      navigate(`/results/${encodeURIComponent(mode)}`);
    }
  };

  const handleLearn = () => {
    navigate(`/learn/${encodeURIComponent(mode)}`);
  };

  return (
    <>
      <style>{focusCss}</style>
      <Header title={mode} backTo="/" />
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>

        {isExponents && (
          <div style={{
            background: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1rem',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
              Power to practice
            </div>
            <div role="group" aria-label="Power to practice" style={{ display: 'flex', gap: '0.5rem' }}>
              {powerChoices.map(p => {
                const active = power === p;
                return (
                  <button
                    key={p}
                    type="button"
                    className="mode-menu-power"
                    aria-pressed={active}
                    aria-label={`Power of ${p}`}
                    onClick={() => setPower(p)}
                    style={{
                      flex: 1,
                      minHeight: '48px',
                      padding: '0.75rem 0.25rem',
                      borderRadius: '10px',
                      fontSize: '1.1rem',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      border: active ? '1px solid var(--secondary-color)' : '1px solid var(--border-dark)',
                      background: active ? 'var(--secondary-color)' : 'var(--surface-color)',
                      color: active ? 'var(--text-light)' : 'var(--text-secondary)'
                    }}
                  >
                    n<sup>{p}</sup>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
              You will be asked for n<sup>{power}</sup> in Practice, and Learn opens on the same power.
              {powerChoices.length < EXPONENT_POWERS.length && (
                <> Higher powers are unavailable at <strong>{difficulty}</strong>, where the numbers
                are already large enough that n<sup>{maxExponentPower(difficulty) + 1}</sup> would run
                past what anyone can hold in their head. Lower the difficulty to unlock them.</>
              )}
            </div>
          </div>
        )}

        <button className="hero-card mode-menu-focusable" onClick={handlePractice}>
          <span className="hc-icon"><Zap size={24} /></span>
          <span className="hc-body">
            <span className="hc-title">Practice</span>
            <span className="hc-desc">Timed challenge — beat the clock</span>
          </span>
          <ChevronRight size={20} className="hc-chev" aria-hidden="true" />
        </button>

        {hasLearn && (
          <button className="mode-card mode-menu-focusable" onClick={handleLearn}>
            <span className="mc-icon"><BookOpen size={22} /></span>
            <span className="mc-body">
              <span className="mc-title">Learn</span>
              <span className="mc-desc">Study the method step by step</span>
            </span>
            <ChevronRight size={18} className="mc-chev" aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  );
}
