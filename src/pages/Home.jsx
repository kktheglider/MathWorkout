import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import {
  Activity, Plus, Minus, X, Divide, Sigma, Layers, Shuffle, Brain,
  Grid3x3, Radical, TrendingUp, ChevronRight
} from 'lucide-react';

const WORKOUT = [
  { name: 'Addition', icon: Plus, desc: 'Sums of two numbers' },
  { name: 'Subtraction', icon: Minus, desc: 'Find the difference' },
  { name: 'Multiplication', icon: X, desc: 'Products & tables' },
  { name: 'Division', icon: Divide, desc: 'Work out quotients' },
  { name: 'Addition & Subtraction', icon: Sigma, desc: 'Both, mixed together' },
  { name: 'Multiplication & Division', icon: Layers, desc: 'Both, mixed together' },
  { name: 'Mixed', icon: Shuffle, desc: 'All four operations' },
  { name: 'Arithmetic Memory', icon: Brain, desc: 'Recall against the clock' },
];

const PRACTICE = [
  { name: 'Multiplication Tables', icon: Grid3x3, desc: 'Master the times tables' },
  { name: 'Square Root', icon: Radical, desc: 'Square-root practice' },
  { name: 'Cube Root', icon: Radical, desc: 'Cube-root practice' },
  { name: 'Math Exponents', icon: TrendingUp, desc: 'Powers & indices' },
];

export default function Home() {
  const navigate = useNavigate();

  // Navigation is unchanged from the original mode routing.
  const handleModeClick = (mode) => {
    if (mode === 'Multiplication') { navigate('/multiplication-modes'); return; }
    if (mode === 'Multiplication Tables' || mode === 'Square Root' || mode === 'Cube Root' || mode === 'Math Exponents') {
      navigate(`/menu/${encodeURIComponent(mode)}`);
    } else {
      navigate(`/results/${encodeURIComponent(mode)}`);
    }
  };

  const ModeCard = ({ m }) => {
    const Icon = m.icon;
    return (
      <button className="mode-card" onClick={() => handleModeClick(m.name)}>
        <span className="mc-icon"><Icon size={22} /></span>
        <span className="mc-body">
          <span className="mc-title">{m.name}</span>
          <span className="mc-desc">{m.desc}</span>
        </span>
        <ChevronRight size={18} className="mc-chev" aria-hidden="true" />
      </button>
    );
  };

  return (
    <>
      <Header title="Math Workout" showSettings={true} />
      <div className="page-content home-page">
        <button className="hero-card" onClick={() => navigate('/analytics')}>
          <span className="hc-icon"><Activity size={24} /></span>
          <span className="hc-body">
            <span className="hc-title">Analytics</span>
            <span className="hc-desc">Track your accuracy, speed &amp; streaks</span>
          </span>
          <ChevronRight size={20} className="hc-chev" aria-hidden="true" />
        </button>

        <h2 className="home-heading">Math Workout</h2>
        <div className="mode-grid">
          {WORKOUT.map(m => <ModeCard key={m.name} m={m} />)}
        </div>

        <h2 className="home-heading">Practice &amp; Learn</h2>
        <div className="mode-grid">
          {PRACTICE.map(m => <ModeCard key={m.name} m={m} />)}
        </div>
      </div>
    </>
  );
}
