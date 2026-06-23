import { useState, useRef, useEffect } from 'react';
import { askQuestion } from '../api';

export default function ChatPage({ addToast }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend(question) {
    const q = (question || input).trim();
    if (!q || loading) return;

    // Add user message
    const userMsg = {
      id: Date.now(),
      type: 'user',
      text: q,
      time: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const data = await askQuestion(q);

      // Parse response
      const botMsg = {
        id: Date.now() + 1,
        type: 'bot',
        text: data.clean_answer || data.answer || 'No response generated.',
        citations: data.citations || [],
        segments: data.segments || [],
        time: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      const errMsg = {
        id: Date.now() + 1,
        type: 'bot',
        text: `Error processing query: ${err.message}`,
        citations: [],
        time: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errMsg]);
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSuggestion(text) {
    handleSend(text);
  }

  const suggestions = [
    'What is this document about?',
    'Summarize the key points',
    'What are the main features?',
    'Explain the architecture',
  ];

  return (
    <div className="chat-view">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div className="chat-header-info">
          <h2>RAG Assistant</h2>
          <span><span className="online-dot" /> Connected to Private Vector Index</span>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && !loading && (
          <div className="chat-welcome">
            <svg xmlns="http://www.w3.org/2000/svg" className="chat-welcome-emoji" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ width: 44, height: 44, margin: '0 auto 16px', color: 'var(--accent-primary)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l8.982-1.569M21 12h-9m0 0V3m0 9v9M3 12h9m0 0V3M12 3a9 9 0 019 9v0a9 9 0 01-9 9v0a9 9 0 01-9-9v0a9 9 0 019-9z" />
            </svg>
            <h2>
              <span className="neon-text">Ask me anything</span>
            </h2>
            <p>
              Ask any questions. I'll search through your indexed documents and synthesize an answer citing sources.
            </p>
            <div className="suggestion-chips">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-chip"
                  onClick={() => handleSuggestion(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.type}`}>
            <div className="message-avatar">
              {msg.type === 'bot' ? 'AI' : 'U'}
            </div>
            <div>
              <div
                className="message-content"
                style={msg.isError ? { borderColor: 'rgba(239, 68, 68, 0.3)' } : {}}
              >
                {msg.text}

                {msg.citations && msg.citations.length > 0 && (
                  <div className="citations">
                    {msg.citations.map((c, i) => (
                      <span key={i} className="citation-chip">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="message-time">
                {msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="typing-indicator">
            <div className="message-avatar" style={{
              background: 'var(--gradient-primary)',
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'bold'
            }}>
              AI
            </div>
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Ask a question about your documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button
            className="chat-send-btn"
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            title="Send message"
          >
            {loading ? (
              <span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.2)' }} />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
