import { useState, useEffect } from 'react';
import { getQueryLogs } from '../api';

export default function LogsPage({ addToast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    setLoading(true);
    try {
      const data = await getQueryLogs();
      setLogs(data.logs || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString();
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>
          <span className="neon-text">Query Logs</span>
        </h1>
        <p>Analyze latency metrics, token consumption, and conversational history</p>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={fetchLogs} disabled={loading}>
          {loading ? (
            <span className="spinner spinner-sm" style={{ marginRight: 6 }} />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          )}
          Refresh
        </button>
      </div>

      {loading && logs.length === 0 && (
        <div className="empty-state">
          <span className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
          <p>Loading query history...</p>
        </div>
      )}

      {!loading && logs.length === 0 && (
        <div className="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" className="empty-state-emoji" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ width: 44, height: 44, margin: '0 auto 12px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3>No queries logged</h3>
          <p>Once queries are executed via the Chat view, detailed traces will appear here.</p>
        </div>
      )}

      <div className="logs-list">
        {logs.map((log, i) => (
          <div
            key={log.id}
            className={`log-card ${expandedId === log.id ? 'expanded' : ''}`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div
              className="log-card-header"
              onClick={() => toggleExpand(log.id)}
            >
              <div className="log-number">#{log.id}</div>
              <div className="log-query">{log.query}</div>
              <div className="log-meta">
                {log.latency_ms != null && (
                  <div className="log-meta-item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    {log.latency_ms}ms
                  </div>
                )}
                {log.prompt_tokens != null && (
                  <div className="log-meta-item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    {log.prompt_tokens + (log.completion_tokens || 0)} tokens
                  </div>
                )}
                <div className="log-meta-item">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {formatTime(log.timestamp)}
                </div>
              </div>
              <svg className="log-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            <div className="log-card-body">
              <div className="log-card-body-inner">
                <div className="log-response">
                  {log.response || 'No response recorded.'}
                </div>
                <div className="log-stats">
                  {log.latency_ms != null && (
                    <div className="log-stat">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, color: 'var(--accent-primary)' }}>
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                      </svg>
                      Latency: <strong>{log.latency_ms}ms</strong>
                    </div>
                  )}
                  {log.prompt_tokens != null && (
                    <div className="log-stat">
                      Prompt Tokens: <strong>{log.prompt_tokens}</strong>
                    </div>
                  )}
                  {log.completion_tokens != null && (
                    <div className="log-stat">
                      Completion Tokens: <strong>{log.completion_tokens}</strong>
                    </div>
                  )}
                  {log.timestamp && (
                    <div className="log-stat">
                      Time: <strong>{formatTime(log.timestamp)}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
