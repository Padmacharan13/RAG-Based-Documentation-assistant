import { useState, useEffect } from 'react';
import { getAnalytics } from '../api';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e'];

export default function AnalyticsPage({ addToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const stats = await getAnalytics();
      setData(stats);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <span className="spinner" style={{ width: 36, height: 36, borderWidth: 2, marginBottom: 12 }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Aggregating system query metrics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container">
        <div className="empty-state glass-card">
          <h3>Failed to load analytics</h3>
          <button className="btn btn-primary" onClick={loadAnalytics} style={{ marginTop: 12 }}>Retry</button>
        </div>
      </div>
    );
  }

  // Pre-process success rate data for PieChart
  const successData = [
    { name: 'Successful Queries', value: Math.round(data.total_queries * (data.success_rate / 100)) },
    { name: 'Insufficient Chunks', value: data.total_queries - Math.round(data.total_queries * (data.success_rate / 100)) }
  ].filter(d => d.value > 0);

  // Fallback if no logs are present yet
  const hasLogs = data.total_queries > 0;

  return (
    <div className="page-container animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>
            <span className="neon-text">Usage Analytics</span>
          </h1>
          <p>Analyze indexing efficacy, query latencies, token limits, and LLM expenses</p>
        </div>
        <button className="btn btn-ghost" onClick={loadAnalytics} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          Refresh Stats
        </button>
      </div>

      {!hasLogs ? (
        <div className="empty-state glass-card" style={{ padding: '80px 20px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="empty-state-emoji" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" style={{ width: 56, height: 56, margin: '0 auto 16px', color: 'var(--text-muted)' }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="9"/>
            <line x1="9" y1="13" x2="15" y2="13"/>
            <line x1="9" y1="17" x2="11" y2="17"/>
          </svg>
          <h3>No activity logged yet</h3>
          <p>Execute document queries in the Chat Room to construct your metrics dashboard.</p>
        </div>
      ) : (
        <>
          {/* Key Metrics Cards Grid */}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-icon purple">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-14 8.38 8.38 0 0 1 3.8.9"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div className="stat-value">{data.total_queries}</div>
              <div className="stat-label">Total Queries</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon cyan">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div className="stat-value">{data.success_rate}%</div>
              <div className="stat-label">Response Success Rate</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <div className="stat-value">${round(data.estimated_cost_usd, 4)}</div>
              <div className="stat-label">Estimated Groq API Cost</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon pink">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 2 22 22 22"/>
                  <line x1="12" y1="13" x2="12" y2="17"/>
                  <line x1="12" y1="9" x2="12.01" y2="9"/>
                </svg>
              </div>
              <div className="stat-value">{data.avg_latency_ms} ms</div>
              <div className="stat-label">Avg Response Latency</div>
            </div>
          </div>

          {/* Charts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 20, marginBottom: 24 }}>
            {/* Query Volume Area Chart */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Query Volume Trend</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={data.daily_queries || []} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}
                      labelStyle={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: 11 }}
                      itemStyle={{ color: 'var(--text-accent)', fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="queries" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorQueries)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Latency Distribution Histogram */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Query Latency Distribution</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={data.latency_histogram || []} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="range" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}
                      itemStyle={{ color: 'var(--accent-cyan)', fontSize: 12 }}
                      labelStyle={{ display: 'none' }}
                    />
                    <Bar dataKey="count" fill="var(--accent-cyan)" radius={[4, 4, 0, 0]}>
                      {data.latency_histogram?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? 'var(--accent-cyan)' : 'var(--accent-secondary)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {/* Token Allocation Metrics */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: 'var(--text-primary)' }}>Token Consumption</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Prompt Context Tokens</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{data.total_prompt_tokens}</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent-primary)', width: `${(data.total_prompt_tokens / Math.max(data.total_tokens, 1)) * 100}%` }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Completion Answer Tokens</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{data.total_completion_tokens}</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent-cyan)', width: `${(data.total_completion_tokens / Math.max(data.total_tokens, 1)) * 100}%` }} />
                  </div>
                </div>

                <div style={{ marginTop: 8, padding: 14, background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-subtle)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Total Tokens Consumed
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {data.total_tokens}
                  </div>
                </div>
              </div>
            </div>

            {/* Success Ratio Pie Chart */}
            <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)' }}>Efficacy Ratio</h3>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
                {successData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={successData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {successData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}
                        itemStyle={{ fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No query data</div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)' }} />
                  Answered ({data.success_rate}%)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-rose)' }} />
                  Insufficient ({round(100 - data.success_rate, 1)}%)
                </div>
              </div>
            </div>

            {/* Top Documents Card List */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Top Queried Documents</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.top_documents && data.top_documents.length > 0 ? (
                  data.top_documents.map((doc, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'rgba(255,255,255,0.015)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 8
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}>
                        <div style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          background: 'rgba(139,92,246,0.1)',
                          color: 'var(--text-accent)',
                          fontSize: 10,
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          #{index + 1}
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.name}>
                          {doc.name}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--text-secondary)', marginLeft: 8 }}>
                        {doc.queries} Q
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                    No retrieval sources logged yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function round(val, precision) {
  const multiplier = Math.pow(10, precision || 0);
  return Math.round(val * multiplier) / multiplier;
}
