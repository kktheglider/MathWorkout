import { useNavigate } from 'react-router-dom';
import { Settings, ArrowLeft } from 'lucide-react';

export default function Header({ title, backTo, onBack, showSettings }) {
  const navigate = useNavigate();

  return (
    <div className="header">
      {(backTo || onBack) ? (
        <button className="header-btn" onClick={() => onBack ? onBack() : navigate(backTo)}>
          <ArrowLeft size={24} />
        </button>
      ) : (
        <div style={{ width: 40 }}></div>
      )}
      
      <h1>{title}</h1>
      
      {showSettings ? (
        <button className="header-btn" onClick={() => navigate('/settings')}>
          <Settings size={24} />
        </button>
      ) : (
        <div style={{ width: 40 }}></div>
      )}
    </div>
  );
}
