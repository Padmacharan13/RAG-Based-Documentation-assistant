import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadDocument, getDocumentStatus } from '../api';

export default function DashboardPage({ addToast }) {
  const [documents, setDocuments] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const pollingRef = useRef({});

  // Poll for document status
  const pollStatus = useCallback((docId, filename) => {
    if (pollingRef.current[docId]) return;

    pollingRef.current[docId] = setInterval(async () => {
      try {
        const data = await getDocumentStatus(docId);
        setDocuments(prev =>
          prev.map(d =>
            d.id === docId
              ? { ...d, status: data.status, error_message: data.error_message }
              : d
          )
        );

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          clearInterval(pollingRef.current[docId]);
          delete pollingRef.current[docId];

          if (data.status === 'COMPLETED') {
            addToast(`📄 "${filename}" is ready! Go ask questions about it 💬`, 'success');
          } else {
            addToast(`❌ Failed to process "${filename}": ${data.error_message}`, 'error');
          }
        }
      } catch {
        // Silently retry
      }
    }, 2000);
  }, [addToast]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingRef.current).forEach(clearInterval);
    };
  }, []);

  async function handleUpload(file) {
    if (!file) return;
    if (!file.name.endsWith('.pdf')) {
      addToast('Only PDF files are supported! 📎', 'error');
      return;
    }

    setUploading(true);
    try {
      const data = await uploadDocument(file);
      const newDoc = {
        id: data.document_id,
        filename: data.filename,
        status: data.status,
        created_at: new Date().toISOString(),
      };
      setDocuments(prev => [newDoc, ...prev]);
      addToast(`"${file.name}" uploaded! Processing... ⏳`, 'info');
      pollStatus(data.document_id, file.name);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleUpload(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    handleUpload(file);
    e.target.value = '';
  }

  const stats = {
    total: documents.length,
    completed: documents.filter(d => d.status === 'COMPLETED').length,
    processing: documents.filter(d => d.status === 'PROCESSING' || d.status === 'PENDING').length,
    failed: documents.filter(d => d.status === 'FAILED').length,
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>
          <span className="neon-text">Dashboard</span> 🎯
        </h1>
        <p>Upload docs, track progress, and manage your knowledge base</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">📚</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Documents</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✅</div>
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">Ready to Query</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon cyan">⚙️</div>
          <div className="stat-value">{stats.processing}</div>
          <div className="stat-label">Processing</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon pink">❌</div>
          <div className="stat-value">{stats.failed}</div>
          <div className="stat-label">Failed</div>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <div className="upload-icon">
          {uploading ? (
            <span className="spinner" style={{ width: 40, height: 40 }} />
          ) : (
            '📄'
          )}
        </div>
        <div className="upload-title">
          {uploading ? 'Uploading...' : 'Drop your PDF here'}
        </div>
        <div className="upload-desc">
          {uploading
            ? 'Hang tight, we\'re sending it to the AI brain 🧠'
            : <>or <span>browse files</span> from your computer</>
          }
        </div>
      </div>

      {/* Document List */}
      {documents.length > 0 && (
        <>
          <div className="docs-section-title">
            📁 Your Documents
          </div>
          <div className="doc-list">
            {documents.map((doc, i) => (
              <div
                className="doc-item"
                key={doc.id}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="doc-icon">📄</div>
                <div className="doc-info">
                  <div className="doc-name">{doc.filename}</div>
                  <div className="doc-meta">
                    {new Date(doc.created_at).toLocaleString()}
                    {doc.error_message && ` • ${doc.error_message}`}
                  </div>
                </div>
                <span className={`doc-status ${doc.status.toLowerCase()}`}>
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {documents.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-emoji">📭</div>
          <h3>No documents yet</h3>
          <p>Upload a PDF to get started! Your AI assistant needs some knowledge first 🧠</p>
        </div>
      )}
    </div>
  );
}
