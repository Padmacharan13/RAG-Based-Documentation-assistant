import { useState } from 'react';
import { register, login } from '../api';

export default function AuthPage({ onAuthSuccess, addToast }) {
  const [activeTab, setActiveTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (activeTab === 'register') {
        await register(username, password);
        setSuccess('Account created! 🎉 Switching to login...');
        addToast('Account created successfully!', 'success');
        setTimeout(() => {
          setActiveTab('login');
          setSuccess('');
        }, 1500);
      } else {
        await login(username, password);
        addToast(`Welcome back, ${username}! 🚀`, 'success');
        onAuthSuccess(username);
      }
    } catch (err) {
      setError(err.message);
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function switchTab(tab) {
    setActiveTab(tab);
    setError('');
    setSuccess('');
  }

  return (
    <div className="auth-page">
      {/* Floating orbs */}
      <div className="auth-bg-orb" />
      <div className="auth-bg-orb" />
      <div className="auth-bg-orb" />

      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">⚡</div>
          <h1 className="auth-title">
            <span className="neon-text">RAG Assistant</span>
          </h1>
          <p className="auth-subtitle">
            Your AI-powered docs companion ✨
          </p>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => switchTab('login')}
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => switchTab('register')}
            >
              Sign Up
            </button>
          </div>

          {error && <div className="auth-error">⚠️ {error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={activeTab === 'register' ? 'new-password' : 'current-password'}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner spinner-sm" />
                  {activeTab === 'login' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                activeTab === 'login' ? 'Sign In 🚀' : 'Create Account ✨'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
