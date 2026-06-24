import { useState, useEffect } from 'react';
import { getAnalytics } from '../api';

export default function SettingsPage({ username, theme, onToggleTheme, addToast, onLogout }) {
  const [hourlyQueries, setHourlyQueries] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 60; // rate limit per hour

  useEffect(() => {
    async function loadStats() {
      try {
        const stats = await getAnalytics();
        setHourlyQueries(stats.hourly_queries || 0);
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [addToast]);

  const percentageUsed = Math.min(Math.round((hourlyQueries / limit) * 100), 100);
  const queriesRemaining = Math.max(limit - hourlyQueries, 0);

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1>
          <span className="neon-text">User Settings</span>
        </h1>
        <p>Manage your account configurations, theme choices, and API usage rates</p>
      </div>

      <div className="settings-grid" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
        {/* Profile Card */}
        <div className="glass-card" style={{ padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            User Profile
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'var(--gradient-primary)',
              color: 'white',
              fontSize: 22,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow-sm)'
            }}>
              {username ? username.slice(0, 2).toUpperCase() : 'AI'}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{username}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Joined: June 24, 2026</div>
              <div style={{ fontSize: 11, color: 'var(--text-accent)', fontWeight: 500, marginTop: 4 }}>Role: Standard Account</div>
            </div>
          </div>
        </div>

        {/* API Usage Meter */}
        <div className="glass-card" style={{ padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/>
              <line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
            API Usage limits
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Your account is subject to hourly request limits on the Groq LLM vector pipeline.
          </p>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
              <span className="spinner" style={{ width: 20, height: 20 }} />
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-primary)' }}>
                  {hourlyQueries} / {limit} queries used
                </span>
                <span style={{ color: percentageUsed > 80 ? 'var(--accent-rose)' : 'var(--text-accent)' }}>
                  {queriesRemaining} remaining this hour
                </span>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  height: '100%',
                  width: `${percentageUsed}%`,
                  background: percentageUsed > 80 ? 'var(--accent-rose)' : 'var(--gradient-primary)',
                  borderRadius: 4,
                  transition: 'width 0.5s ease'
                }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Resets hourly on a rolling window. Rate limits protect against API abuse.
              </span>
            </div>
          )}
        </div>

        {/* Display & Personalization */}
        <div className="glass-card" style={{ padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2v20"/>
              <path d="M12 12H2"/>
            </svg>
            Display Theme
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Color Theme Mode</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                Toggle visual modes between High Contrast Dark and Clean Light aesthetics.
              </div>
            </div>
            <button
              className="btn btn-ghost"
              onClick={onToggleTheme}
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {theme === 'light' ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                  </svg>
                  Dark Mode
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                  </svg>
                  Light Mode
                </>
              )}
            </button>
          </div>
        </div>

        {/* Action Panel */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 10 }}>
          <button className="btn" onClick={onLogout} style={{
            background: 'rgba(244,63,94,0.06)',
            borderColor: 'rgba(244,63,94,0.2)',
            color: 'var(--accent-rose)',
            padding: '10px 24px'
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout Account
          </button>
        </div>
      </div>
    </div>
  );
}
