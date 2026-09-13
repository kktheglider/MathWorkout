import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { X, Target, Zap, ChevronRight } from 'lucide-react';

const MODES = [
  { mode: 'Multiplication', label: 'Normal Mode', icon: X, desc: 'Standard multiplication drills' },
  { mode: 'Weakness Practice', label: 'Weakness Practice', icon: Target, desc: 'Focus on the facts you miss' },
  { mode: 'Carry Stress Mode', label: 'Carry Stress Mode', icon: Zap, desc: 'Carry-heavy problems, timed' },
];

const focusCss = `
.multiplication-menu-btn:focus-visible {
  outline: 3px solid var(--secondary-color);
  outline-offset: 2px;
}
`;

export default function MultiplicationMenu() {
  const navigate = useNavigate();

  return (
    <>
      <style>{focusCss}</style>
      <Header title="Multiplication" backTo="/" />
      <div className="page-content" style={{ paddingTop: '1.5rem' }}>
        <div className="mode-grid" style={{ gridTemplateColumns: '1fr' }}>
          {MODES.map(({ mode, label, icon: Icon, desc }) => (
            <button
              key={mode}
              className="mode-card multiplication-menu-btn"
              onClick={() => navigate(`/results/${encodeURIComponent(mode)}`)}
            >
              <span className="mc-icon"><Icon size={22} /></span>
              <span className="mc-body">
                <span className="mc-title">{label}</span>
                <span className="mc-desc">{desc}</span>
              </span>
              <ChevronRight size={18} className="mc-chev" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
