import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Game from './pages/Game';
import Results from './pages/Results';
import MultiplicationTablesMenu from './pages/MultiplicationTablesMenu';
import MultiplicationTablesSettings from './pages/MultiplicationTablesSettings';
import ModeMenu from './pages/ModeMenu';
import Learn from './pages/Learn';
import MultiplicationMenu from './pages/MultiplicationMenu';
import Analytics from './pages/Analytics';

function NotFound() {
  const navigate = useNavigate();
  return (
    <>
      <Header title="Not found" backTo="/" />
      <div className="page-content">
        <div style={{
          background: 'var(--surface-color)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-sm)',
          padding: '1.75rem 1.25rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          lineHeight: 1.55
        }}>
          <h3 style={{ color: 'var(--primary-color)', fontSize: '1.1rem', marginBottom: '0.6rem' }}>
            This page doesn&apos;t exist
          </h3>
          <p style={{ marginBottom: '1.25rem' }}>
            The link may be out of date. Head back to the home screen to pick a mode.
          </p>
          <button className="btn-primary" style={{ marginBottom: 0 }} onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    </>
  );
}

function App() {
  /* Read straight from storage during the first render. An effect is too late:
     child effects run before parent effects, so Game.jsx would generate its
     whole question set from the defaults whenever /game/:mode is loaded
     directly - a refresh, a deep link, or a PWA launch - and silently play the
     wrong difficulty and question count. */
  const [settings, setSettings] = useState(() => {
    const defaults = {
      difficulty: 'Expert',
      questions: 10,
      sounds: true,
      displayTime: true,
      keyboardSize: 'Medium',
      theme: 'default',
      modeDifficulties: {}
    };
    try {
      const saved = localStorage.getItem('mathWorkoutSettings');
      if (!saved) return defaults;
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
      return {
        ...defaults,
        ...parsed,
        modeDifficulties: (parsed.modeDifficulties && typeof parsed.modeDifficulties === 'object')
          ? parsed.modeDifficulties
          : {}
      };
    } catch {
      return defaults; // storage blocked or corrupt - play with the defaults
    }
  });

  // Save to local storage when changed and apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'default');
    localStorage.setItem('mathWorkoutSettings', JSON.stringify(settings));
  }, [settings]);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Router basename={(import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "/"}>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings settings={settings} updateSetting={updateSetting} />} />
          <Route path="/game/:mode" element={<Game settings={settings} />} />
          <Route path="/results/:mode" element={<Results settings={settings} updateSetting={updateSetting} />} />
          <Route path="/menu/:mode" element={<ModeMenu />} />
          <Route path="/learn/:mode" element={<Learn />} />
          <Route path="/multiplication-tables" element={<MultiplicationTablesMenu />} />
          <Route path="/multiplication-tables/practice" element={<MultiplicationTablesSettings />} />
          <Route path="/multiplication-modes" element={<MultiplicationMenu />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
