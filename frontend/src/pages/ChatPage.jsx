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
        text: `Oops! Something went wrong: ${err.message}`,
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
        <div className="chat-header-icon">🤖</div>
        <div className="chat-header-info">
          <h2>RAG Assistant</h2>
          <span><span className="online-dot" /> Online &amp; ready to help</span>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && !loading && (
          <div className="chat-welcome">
            <div className="chat-welcome-emoji">🧠</div>
            <h2>
              <span className="neon-text">Ask me anything</span>
            </h2>
            <p>
              I'll search through your uploaded documents and give you answers with sources. No cap. 🔥
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
              {msg.type === 'bot' ? '🤖' : '🧑'}
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
                        📄 {c}
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
              background: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 50%, #ec4899 100%)',
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
            }}>
              🤖
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
            placeholder="Ask something about your docs... 💡"
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
              '➤'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
