import { useState, useEffect } from 'react';
import ParticleCanvas from './components/ParticleCanvas';
import Toast, { useToast } from './components/Toast';
import Sidebar from './components/Sidebar';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import DocumentPage from './pages/DocumentPage';
import ChatPage from './pages/ChatPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import { isAuthenticated, logout as apiLogout, getUsername } from './api';

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [view, setView] = useState('dashboard');
  const [username, setUsername] = useState(getUsername());
  const [theme, setTheme] = useState(localStorage.getItem('rag_theme') || 'dark');
  const { toasts, addToast, removeToast } = useToast();

  // Sync auth state
  useEffect(() => {
    setAuthed(isAuthenticated());
    setUsername(getUsername());
  }, []);

  // Theme effect
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-theme');
      localStorage.setItem('rag_theme', 'light');
    } else {
      root.classList.remove('light-theme');
      localStorage.setItem('rag_theme', 'dark');
    }
  }, [theme]);

  function handleAuthSuccess(name) {
    setAuthed(true);
    setUsername(name);
  }

  function handleLogout() {
    apiLogout();
    setAuthed(false);
    setUsername('');
    setView('dashboard');
    addToast('Logged out successfully.', 'info');
  }

  function handleNavigate(newView) {
    setView(newView);
  }

  function handleToggleTheme() {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }

  return (
    <>
      <ParticleCanvas />
      <Toast toasts={toasts} removeToast={removeToast} />

      {!authed ? (
        <AuthPage onAuthSuccess={handleAuthSuccess} addToast={addToast} />
      ) : (
        <div className="app-layout">
          <Sidebar
            activeView={view}
            onNavigate={handleNavigate}
            username={username}
            onLogout={handleLogout}
            theme={theme}
            onToggleTheme={handleToggleTheme}
          />
          <main className="main-content">
            {view === 'dashboard' && (
              <DashboardPage onNavigate={handleNavigate} addToast={addToast} />
            )}
            {view === 'documents' && (
              <DocumentPage addToast={addToast} />
            )}
            {view === 'chat' && (
              <ChatPage addToast={addToast} />
            )}
            {view === 'analytics' && (
              <AnalyticsPage addToast={addToast} />
            )}
            {view === 'settings' && (
              <SettingsPage
                username={username}
                theme={theme}
                onToggleTheme={handleToggleTheme}
                addToast={addToast}
                onLogout={handleLogout}
              />
            )}
          </main>
        </div>
      )}
    </>
  );
}
