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
            addToast(`Document "${filename}" processed successfully. Ready for query.`, 'success');
          } else {
            addToast(`Failed to process "${filename}": ${data.error_message}`, 'error');
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
      addToast('Only PDF files are supported.', 'error');
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
      addToast(`"${file.name}" uploaded. Processing started.`, 'info');
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
          <span className="neon-text">Dashboard</span>
        </h1>
        <p>Upload documents, track ingestion status, and manage your private vector index</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
              <path d="M6 6h10M6 10h10"/>
            </svg>
          </div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Documents</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">Ready to Query</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon cyan">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </div>
          <div className="stat-value">{stats.processing}</div>
          <div className="stat-label">Processing</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon pink">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
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
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ width: 44, height: 44 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
          )}
        </div>
        <div className="upload-title">
          {uploading ? 'Uploading Document...' : 'Drop your PDF here'}
        </div>
        <div className="upload-desc">
          {uploading
            ? 'Saving document details and starting parsing pipeline...'
            : <>or <span>browse files</span> from your computer</>
          }
        </div>
      </div>

      {/* Document List */}
      {documents.length > 0 && (
        <>
          <div className="docs-section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            Documents
          </div>
          <div className="doc-list">
            {documents.map((doc, i) => (
              <div
                className="doc-item"
                key={doc.id}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="doc-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
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
          <svg xmlns="http://www.w3.org/2000/svg" className="empty-state-emoji" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ width: 44, height: 44, margin: '0 auto 12px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          <h3>No documents indexed</h3>
          <p>Please upload a PDF document. Its chunks will be embedded and catalogued automatically.</p>
        </div>
      )}
    </div>
  );
}
