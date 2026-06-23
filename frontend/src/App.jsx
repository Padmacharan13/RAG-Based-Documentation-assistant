import { useState, useEffect } from 'react';
import ParticleCanvas from './components/ParticleCanvas';
import Toast, { useToast } from './components/Toast';
import Sidebar from './components/Sidebar';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import ChatPage from './pages/ChatPage';
import LogsPage from './pages/LogsPage';
import { isAuthenticated, logout as apiLogout, getUsername } from './api';

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [view, setView] = useState('dashboard');
  const [username, setUsername] = useState(getUsername());
  const { toasts, addToast, removeToast } = useToast();

  // Sync auth state
  useEffect(() => {
    setAuthed(isAuthenticated());
    setUsername(getUsername());
  }, []);

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
          />
          <main className="main-content">
            {view === 'dashboard' && (
              <DashboardPage addToast={addToast} />
            )}
            {view === 'chat' && (
              <ChatPage addToast={addToast} />
            )}
            {view === 'logs' && (
              <LogsPage addToast={addToast} />
            )}
          </main>
        </div>
      )}
    </>
  );
}
