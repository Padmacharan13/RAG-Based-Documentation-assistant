export default function Sidebar({ activeView, onNavigate, username, onLogout }) {
  const navItems = [
    { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
    { id: 'chat', icon: '💬', label: 'Ask AI' },
    { id: 'logs', icon: '📊', label: 'Query Logs' },
  ];

  const initials = username ? username.slice(0, 2).toUpperCase() : '??';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" title="RAG Assistant">
        ⚡
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-btn ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            <span className="tooltip">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button
          className="sidebar-btn"
          onClick={onLogout}
          title="Logout"
        >
          🚪
          <span className="tooltip">Logout</span>
        </button>
        <div className="sidebar-avatar" title={username}>
          {initials}
        </div>
      </div>
    </aside>
  );
}
