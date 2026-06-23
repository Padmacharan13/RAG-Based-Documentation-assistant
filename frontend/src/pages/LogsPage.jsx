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
          <span className="neon-text">Query Logs</span> 📊
        </h1>
        <p>Your complete conversation history with latency &amp; token stats</p>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={fetchLogs} disabled={loading}>
          {loading ? <span className="spinner spinner-sm" /> : '🔄'} Refresh
        </button>
      </div>

      {loading && logs.length === 0 && (
        <div className="empty-state">
          <span className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
          <p>Loading your query history...</p>
        </div>
      )}

      {!loading && logs.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-emoji">🔍</div>
          <h3>No queries yet</h3>
          <p>Go ask some questions in the Chat view and they'll show up here!</p>
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
                    <span className="icon">⚡</span>
                    {log.latency_ms}ms
                  </div>
                )}
                {log.prompt_tokens != null && (
                  <div className="log-meta-item">
                    <span className="icon">🔤</span>
                    {log.prompt_tokens + (log.completion_tokens || 0)} tokens
                  </div>
                )}
                <div className="log-meta-item">
                  <span className="icon">🕐</span>
                  {formatTime(log.timestamp)}
                </div>
              </div>
              <span className="log-chevron">▼</span>
            </div>

            <div className="log-card-body">
              <div className="log-card-body-inner">
                <div className="log-response">
                  {log.response || 'No response recorded.'}
                </div>
                <div className="log-stats">
                  {log.latency_ms != null && (
                    <div className="log-stat">
                      ⚡ Latency: <strong>{log.latency_ms}ms</strong>
                    </div>
                  )}
                  {log.prompt_tokens != null && (
                    <div className="log-stat">
                      📥 Prompt: <strong>{log.prompt_tokens} tokens</strong>
                    </div>
                  )}
                  {log.completion_tokens != null && (
                    <div className="log-stat">
                      📤 Completion: <strong>{log.completion_tokens} tokens</strong>
                    </div>
                  )}
                  {log.timestamp && (
                    <div className="log-stat">
                      🕐 Time: <strong>{formatTime(log.timestamp)}</strong>
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
