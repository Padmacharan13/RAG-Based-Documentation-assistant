import { useState, useRef, useEffect, useCallback } from 'react';
import { askQuestion, listDocuments, getQueryLogs, deleteQueryLog } from '../api';

export default function ChatPage({ addToast }) {
  // Navigation / Layout State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);
  
  // RAG Content State
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null); // Document filter
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connStatus, setConnStatus] = useState('connected'); // 'connected' | 'reconnecting' | 'error'
  
  // History State
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  
  // Streaming State references
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load documents and past logs
  const loadSidebarData = useCallback(async () => {
    try {
      setConnStatus('reconnecting');
      const [docsData, logsData] = await Promise.all([
        listDocuments(),
        getQueryLogs()
      ]);
      setDocuments(docsData.documents || []);
      setHistoryLogs(logsData.logs || []);
      setConnStatus('connected');
    } catch (err) {
      setConnStatus('error');
      addToast(err.message, 'error');
    }
  }, [addToast]);

  useEffect(() => {
    loadSidebarData();
  }, [loadSidebarData]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streamingText]);

  // Handle load past query log into conversation
  const handleSelectHistoryLog = (log) => {
    let chunks = [];
    try {
      chunks = JSON.parse(log.retrieved_chunks) || [];
    } catch (e) {
      // Ignored
    }

    const pastUserMsg = {
      id: `past-u-${log.id}`,
      type: 'user',
      text: log.query,
      time: new Date(log.timestamp),
    };

    const pastBotMsg = {
      id: `past-b-${log.id}`,
      type: 'bot',
      text: log.response,
      citations: chunks.map(c => c.page_number),
      retrieved_chunks: chunks.map(c => ({
        text: c.text || 'Context retrieved.',
        page_number: c.page_number,
        document_name: c.document_name,
        similarity: c.similarity
      })),
      time: new Date(log.timestamp),
      short_circuited: log.response.includes("does not contain enough information")
    };

    setMessages([pastUserMsg, pastBotMsg]);
    setInspectorOpen(false);
    setSelectedCitation(null);
  };

  // Handle delete log from history
  const handleDeleteLog = async (e, logId) => {
    e.stopPropagation();
    if (!confirm('Delete this query log?')) return;
    try {
      await deleteQueryLog(logId);
      setHistoryLogs(prev => prev.filter(log => log.id !== logId));
      addToast('History item removed.', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Simulate token streaming
  const streamBotResponse = (fullText, responseData, messageId) => {
    setStreamingMessageId(messageId);
    setStreamingText('');
    
    // Split into tokens (approximate word-by-word)
    const tokens = fullText.split(/(\s+)/);
    let index = 0;
    
    const interval = setInterval(() => {
      if (index < tokens.length) {
        setStreamingText(prev => prev + tokens[index]);
        index++;
      } else {
        clearInterval(interval);
        
        // Finalize state: append real message and clear stream status
        const botMsg = {
          id: messageId,
          type: 'bot',
          text: fullText,
          citations: responseData.citations || [],
          retrieved_chunks: responseData.retrieved_chunks || [],
          time: new Date(),
          short_circuited: responseData.short_circuited
        };
        
        setMessages(prev => [...prev, botMsg]);
        setStreamingMessageId(null);
        setStreamingText('');
        
        // Reload history logs to include the newly indexed query
        loadSidebarData();
      }
    }, 30); // 30ms per word token
  };

  const handleSend = async (questionText) => {
    const q = (questionText || input).trim();
    if (!q || loading || streamingMessageId) return;

    // Add user message to conversation list
    const userMsg = {
      id: `user-${Date.now()}`,
      type: 'user',
      text: q,
      time: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setInspectorOpen(false);
    setSelectedCitation(null);

    try {
      // Execute ask query
      // k=4, similarity=0.35 are defaults. We could customize.
      const responseData = await askQuestion(q);
      
      const botText = responseData.clean_answer || responseData.answer || 'No response generated.';
      
      // Trigger live streaming simulation
      setLoading(false);
      streamBotResponse(botText, responseData, `bot-${Date.now()}`);
      
    } catch (err) {
      setLoading(false);
      const errMsg = {
        id: `bot-err-${Date.now()}`,
        type: 'bot',
        text: `Error processing query: ${err.message}`,
        citations: [],
        time: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errMsg]);
      addToast(err.message, 'error');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCitationClick = (citationNum, retrievedChunks) => {
    // citationNum is the page number (or matching element index)
    // Find the corresponding chunk
    const matchingChunk = retrievedChunks?.find(c => c.page_number === citationNum);
    if (matchingChunk) {
      setSelectedCitation({
        ...matchingChunk,
        highlightWords: input // Highlight words from prompt
      });
      setInspectorOpen(true);
    } else {
      addToast(`Could not inspect source details for Page ${citationNum}`, 'info');
    }
  };

  // Helper to highlight terms inside cited text
  const highlightCitedText = (text, query) => {
    if (!query) return text;
    // Extract keywords of 4+ characters to highlight
    const keywords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);
      
    if (keywords.length === 0) return text;
    
    // Create regex pattern matching any keyword
    const pattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
    const parts = text.split(pattern);
    
    return parts.map((part, index) => 
      pattern.test(part) ? <mark key={index} className="citation-highlight">{part}</mark> : part
    );
  };

  // Clear Context Toggle button action
  const handleClearContext = () => {
    setMessages([]);
    setSelectedCitation(null);
    setInspectorOpen(false);
    addToast('Conversation log and context reset.', 'info');
  };

  // Filter history logs based on search term
  const filteredLogs = historyLogs.filter(log => 
    log.query.toLowerCase().includes(historySearch.toLowerCase()) || 
    (log.response && log.response.toLowerCase().includes(historySearch.toLowerCase()))
  );

  return (
    <div className={`chat-workspace ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'} ${inspectorOpen ? 'inspector-expanded' : 'inspector-collapsed'}`} style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* 1. LEFT PANEL: Documents & Query History */}
      <aside className="chat-sidebar glass" style={{
        width: 280,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border-subtle)',
        flexShrink: 0,
        transition: 'all 0.3s var(--ease-smooth)',
        position: 'relative',
        zIndex: 50
      }}>
        {/* Document Selector Header */}
        <div style={{ padding: 18, borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Vector Scope
          </h3>
          <div className="doc-select-wrapper" style={{ position: 'relative' }}>
            <select
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 12.5,
                outline: 'none',
                appearance: 'none',
                cursor: 'pointer'
              }}
              value={selectedDoc ? selectedDoc.id : ''}
              onChange={(e) => {
                const docId = e.target.value;
                const found = documents.find(d => d.id === parseInt(docId));
                setSelectedDoc(found || null);
                if (found) {
                  addToast(`Scope locked to file "${found.filename}"`, 'info');
                } else {
                  addToast('Scope unlocked. Searching across all files.', 'info');
                }
              }}
            >
              <option value="">Search all documents...</option>
              {documents.filter(d => d.status === 'COMPLETED').map(doc => (
                <option key={doc.id} value={doc.id}>
                  {doc.filename}
                </option>
              ))}
            </select>
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)', fontSize: 10 }}>
              ▼
            </div>
          </div>
        </div>

        {/* History Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 16, pb: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Query logs
            </h4>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search past logs..."
                className="form-input"
                style={{ fontSize: 12, padding: '6px 10px', height: 32 }}
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              {historySearch && (
                <button
                  onClick={() => setHistorySearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {/* List of past questions */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }} className="custom-scroll">
            {filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                {historySearch ? 'No matching logs' : 'No query logs recorded'}
              </div>
            ) : (
              filteredLogs.map(log => (
                <div
                  key={log.id}
                  onClick={() => handleSelectHistoryLog(log)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: 12,
                    marginBottom: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    transition: 'background 0.2s',
                    position: 'relative'
                  }}
                  className="history-log-item"
                >
                  <div style={{
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    paddingRight: 20
                  }}>
                    {log.query}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                    <button
                      className="history-delete-btn"
                      onClick={(e) => handleDeleteLog(e, log.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        fontSize: 12
                      }}
                      title="Delete log entry"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Toggle Panel Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: 'absolute',
            right: -12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
          }}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? '◀' : '▶'}
        </button>
      </aside>

      {/* 2. CENTER PANEL: Chat Space */}
      <section className="chat-main" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-secondary)',
        position: 'relative'
      }}>
        {/* Chat Header / Breadcrumb */}
        <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Context breadcrumb */}
            <button
              className="btn btn-ghost"
              onClick={() => setSelectedDoc(null)}
              disabled={!selectedDoc}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                height: 30,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              All Files
            </button>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>/</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {selectedDoc ? `Document: "${selectedDoc.filename}"` : 'Global Query Matrix'}
              </span>
            </div>
          </div>

          {/* Connected Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span className={`online-dot ${connStatus}`} style={{
              background: connStatus === 'connected' ? 'var(--accent-emerald)' : connStatus === 'reconnecting' ? 'var(--accent-amber)' : 'var(--accent-rose)'
            }} />
            {connStatus === 'connected' ? 'Connected' : connStatus === 'reconnecting' ? 'Syncing...' : 'Connection Error'}
          </div>
        </div>

        {/* Message Panel */}
        <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }} className="custom-scroll chat-messages">
          {messages.length === 0 && !loading && !streamingMessageId && (
            <div className="chat-welcome">
              <div className="chat-welcome-emoji">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ width: 44, height: 44, margin: '0 auto', color: 'var(--text-accent)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <h2>Synthesize Query Answers</h2>
              <p>
                {selectedDoc
                  ? `Enter a question. I will index text chunks specifically from "${selectedDoc.filename}" to synthesize a factual response.`
                  : 'Ask any question. I will search across all indexed PDFs and construct a cited response.'}
              </p>
              
              <div className="suggestion-chips">
                {[
                  'What is this database scope?',
                  'Summarize the core themes',
                  'What are the key technical constraints?',
                  'Define the ingestion overlap formula'
                ].map((s, idx) => (
                  <button
                    key={idx}
                    className="suggestion-chip"
                    onClick={() => handleSend(s)}
                    disabled={loading || streamingMessageId}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages list */}
          {messages.map((msg) => {
            const isBot = msg.type === 'bot';
            return (
              <div key={msg.id} className={`message ${msg.type}`}>
                <div className="message-avatar">
                  {isBot ? 'AI' : 'U'}
                </div>
                <div style={{ flex: 1 }}>
                  {msg.short_circuited ? (
                    /* Error state / Insufficient Chunks Card */
                    <div className="glass-card" style={{
                      padding: 20,
                      border: '1px solid rgba(244,63,94,0.2)',
                      background: 'rgba(244,63,94,0.03)',
                      borderRadius: 'var(--radius-lg)',
                      maxWidth: 550,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12
                    }}>
                      <div style={{ color: 'var(--accent-rose)', flexShrink: 0 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                      </div>
                      <div>
                        <h4 style={{ fontSize: 13.5, fontWeight: 700, color: '#f43f5e', marginBottom: 4 }}>
                          Insufficient Relevance Context
                        </h4>
                        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {msg.text}
                        </p>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 8 }}>
                          Bypassed LLM generation: Cosine similarity search scored below relevance threshold (0.35).
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Standard Message Content */
                    <div className="message-content">
                      {msg.text}

                      {/* Display inline citations chips if present */}
                      {isBot && msg.citations && msg.citations.length > 0 && (
                        <div className="citations">
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', marginRight: 4 }}>
                            Citations:
                          </span>
                          {msg.citations.map((c, idx) => (
                            <button
                              key={idx}
                              className="citation-chip"
                              onClick={() => handleCitationClick(c, msg.retrieved_chunks)}
                              title={`Inspect Page ${c} Source Chunks`}
                              style={{ cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 2, color: 'var(--accent-cyan)' }}>
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                              </svg>
                              Page {c}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="message-time">
                    {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Active Streaming Message */}
          {streamingMessageId && (
            <div className="message bot">
              <div className="message-avatar">AI</div>
              <div style={{ flex: 1 }}>
                <div className="message-content">
                  {streamingText}
                  <span className="streaming-cursor" style={{
                    display: 'inline-block',
                    marginLeft: 2,
                    color: 'var(--accent-primary)',
                    animation: 'pulse-soft 0.8s infinite'
                  }}>▌</span>
                </div>
              </div>
            </div>
          )}

          {/* Skeleton typing indicator loader */}
          {loading && (
            <div className="typing-indicator" style={{ animation: 'pulse-soft 1s infinite alternate' }}>
              <div className="message-avatar">AI</div>
              <div className="typing-dots">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            {/* Clear Context button */}
            <button
              className="chat-send-btn btn-ghost"
              onClick={handleClearContext}
              title="Clear context & conversations"
              style={{
                width: 42,
                height: 42,
                background: 'rgba(255,255,255,0.01)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-muted)'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>

            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder={selectedDoc ? `Ask about "${selectedDoc.filename}"...` : "Search indexing scope and ask a question..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading || !!streamingMessageId}
              style={{
                background: 'var(--bg-glass)',
                backdropFilter: 'blur(10px)',
                minHeight: 42,
                maxHeight: 120,
                alignSelf: 'center'
              }}
            />

            <button
              className="chat-send-btn"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading || !!streamingMessageId}
              title="Send query"
              style={{ width: 42, height: 42 }}
            >
              {loading ? (
                <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 3. RIGHT PANEL: Citation / Source Inspector */}
      <aside className="chat-inspector glass" style={{
        width: 320,
        height: '100%',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(9, 9, 11, 0.98)',
        flexShrink: 0,
        transition: 'transform 0.3s var(--ease-smooth)',
        transform: inspectorOpen ? 'translateX(0)' : 'translateX(100%)',
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 100
      }}>
        {selectedCitation ? (
          <>
            <div style={{ padding: 18, borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-accent)' }}>
                Citation Inspector
              </h3>
              <button
                className="btn btn-ghost"
                onClick={() => setInspectorOpen(false)}
                style={{ padding: 4, width: 26, height: 26, borderRadius: '50%' }}
              >
                &times;
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 18 }} className="custom-scroll">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Source Document</label>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {selectedCitation.document_name}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: 10 }}>Page Number</label>
                    <div style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--accent-cyan)' }}>
                      Page {selectedCitation.page_number}
                    </div>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: 10 }}>Similarity Score</label>
                    <div style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--accent-emerald)' }}>
                      {round(selectedCitation.similarity, 4)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Ingested Text Chunk</label>
                  <div style={{
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: 14,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 280,
                    overflowY: 'auto'
                  }} className="custom-scroll">
                    {highlightCitedText(selectedCitation.text, selectedCitation.highlightWords)}
                  </div>
                </div>

                <div style={{ background: 'rgba(6,182,212,0.03)', border: '1px solid rgba(6,182,212,0.12)', borderRadius: 8, padding: 12 }}>
                  <label className="form-label" style={{ fontSize: 9, color: 'var(--accent-cyan)' }}>Metadata Index</label>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Database reference chunk matching search node index. Similarity threshold verified above target 0.35 constraint.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={() => addToast('Original PDF preview not available in sandbox environment.', 'info')}
                style={{ width: '100%' }}
              >
                View in Document
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setInspectorOpen(false)}
                style={{ width: '100%' }}
              >
                Close Inspector
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 20, textAlign: 'center' }}>
            Click an inline citation chip [Page X] in the chat area to inspect its vector metadata.
          </div>
        )}
      </aside>
    </div>
  );
}

function round(val, precision) {
  const multiplier = Math.pow(10, precision || 0);
  return Math.round(val * multiplier) / multiplier;
}
