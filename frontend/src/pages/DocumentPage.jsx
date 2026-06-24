import { useState, useEffect, useRef, useCallback } from 'react';
import { listDocuments, deleteDocument, uploadDocument, getDocumentStatus, getToken } from '../api';

export default function DocumentPage({ addToast }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState(''); // 'uploading' | 'processing' | ''
  const [selectedDoc, setSelectedDoc] = useState(null); // for Details modal
  const fileInputRef = useRef(null);
  const reuploadInputRef = useRef(null);
  const reuploadIdRef = useRef(null);
  const pollingRef = useRef({});

  const fetchDocs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await listDocuments();
      setDocuments(data.documents || []);
      
      // Auto-start polling for any documents that are PENDING or PROCESSING
      (data.documents || []).forEach(doc => {
        if (doc.status === 'PENDING' || doc.status === 'PROCESSING') {
          pollDocStatus(doc.id, doc.filename);
        }
      });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchDocs();
    return () => {
      Object.values(pollingRef.current).forEach(clearInterval);
    };
  }, [fetchDocs]);

  const pollDocStatus = useCallback((docId, filename) => {
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

          // Trigger a silent full refresh to update counts (chunks, pages)
          fetchDocs(true);

          if (data.status === 'COMPLETED') {
            addToast(`Document "${filename}" processed successfully. Ready to query!`, 'success');
          } else {
            addToast(`Failed to process "${filename}": ${data.error_message}`, 'error');
          }
        }
      } catch (e) {
        // Retry silently
      }
    }, 2000);
  }, [addToast, fetchDocs]);

  const handleUpload = (file, isReupload = false, reuploadId = null) => {
    if (!file) return;
    if (!file.name.endsWith('.pdf')) {
      addToast('Only PDF files are supported.', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setProcessingStatus('uploading');

    // If reuploading, delete the old document first
    const performActualUpload = async () => {
      try {
        if (isReupload && reuploadId) {
          await deleteDocument(reuploadId);
          setDocuments(prev => prev.filter(d => d.id !== reuploadId));
        }

        // Use XMLHttpRequest for upload progress
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);

        xhr.open('POST', '/upload', true);
        const token = getToken();
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentage = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percentage);
            if (percentage === 100) {
              setProcessingStatus('processing');
            }
          }
        };

        xhr.onload = () => {
          setUploading(false);
          setProcessingStatus('');
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText);
            const newDoc = {
              id: response.document_id,
              filename: response.filename,
              status: response.status,
              created_at: new Date().toISOString(),
              chunk_count: 0,
              page_count: 0,
              file_size_kb: round((file.size / 1024), 1)
            };
            setDocuments(prev => [newDoc, ...prev]);
            addToast(`"${file.name}" uploaded successfully. Ingestion pipeline started.`, 'info');
            pollDocStatus(response.document_id, file.name);
          } else {
            const err = JSON.parse(xhr.responseText);
            addToast(err.detail || 'Upload failed.', 'error');
          }
        };

        xhr.onerror = () => {
          setUploading(false);
          setProcessingStatus('');
          addToast('Network error during upload.', 'error');
        };

        xhr.send(formData);
      } catch (err) {
        setUploading(false);
        setProcessingStatus('');
        addToast(err.message, 'error');
      }
    };

    performActualUpload();
  };

  const handleDelete = async (id, filename) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This will remove all its chunks and rebuild your index.`)) {
      return;
    }
    try {
      await deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      if (pollingRef.current[id]) {
        clearInterval(pollingRef.current[id]);
        delete pollingRef.current[id];
      }
      addToast(`"${filename}" deleted successfully.`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleReuploadClick = (id) => {
    reuploadIdRef.current = id;
    reuploadInputRef.current?.click();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleUpload(file);
  };

  const round = (val, precision) => {
    const multiplier = Math.pow(10, precision || 0);
    return Math.round(val * multiplier) / multiplier;
  };

  return (
    <div className="page-container animate-in">
      <div className="page-header">
        <h1>
          <span className="neon-text">Document Management</span>
        </h1>
        <p>Index documents, monitor ingestion pipelines, and clean context partitions</p>
      </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading-state' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{ pointerEvents: uploading ? 'none' : 'auto' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => { handleUpload(e.target.files[0]); e.target.value = ''; }}
        />
        <input
          ref={reuploadInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            handleUpload(e.target.files[0], true, reuploadIdRef.current);
            e.target.value = '';
          }}
        />

        {uploading ? (
          <div className="upload-progress-container" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
            <div className="upload-icon-spinner">
              <span className="spinner" style={{ width: 44, height: 44, borderWidth: 3 }} />
            </div>
            <div className="upload-title" style={{ marginTop: 12 }}>
              {processingStatus === 'uploading'
                ? `Uploading Document (${uploadProgress}%)`
                : 'Processing PDF Pipeline...'}
            </div>
            <div className="upload-desc">
              {processingStatus === 'uploading'
                ? 'Sending bytes to secure sandbox server'
                : 'Extracting texts, creating overlaps, generating embeddings, and indexing FAISS'}
            </div>
            <div className="progress-bar-outer" style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 16, overflow: 'hidden' }}>
              <div
                className="progress-bar-inner"
                style={{
                  height: '100%',
                  background: 'var(--gradient-primary)',
                  width: `${uploadProgress}%`,
                  transition: 'width 0.2s ease',
                  boxShadow: 'var(--shadow-glow-sm)'
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="upload-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" style={{ width: 48, height: 48 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
            </div>
            <div className="upload-title">Drag & Drop PDF document here</div>
            <div className="upload-desc">
              or <span>browse files</span> to upload. Max size 20MB.
            </div>
          </>
        )}
      </div>

      {/* Document Grid */}
      <div className="docs-section-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        Indexed Documents ({documents.length})
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <span className="spinner" style={{ width: 36, height: 36, borderWidth: 2 }} />
        </div>
      ) : documents.length === 0 ? (
        <div className="empty-state glass-card" style={{ padding: '60px 20px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="empty-state-emoji" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" style={{ width: 56, height: 56, margin: '0 auto 16px', color: 'var(--text-muted)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <h3>No indexed files</h3>
          <p>Index documents above to build your private context retrieval database.</p>
        </div>
      ) : (
        <div className="doc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {documents.map((doc, idx) => {
            const mappedStatus = doc.status === 'COMPLETED' ? 'ready' : doc.status === 'FAILED' ? 'failed' : 'processing';
            return (
              <div
                key={doc.id}
                className="doc-grid-card glass-card"
                style={{
                  animationDelay: `${idx * 0.05}s`,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="doc-card-icon" style={{
                    width: 38,
                    height: 38,
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255,255,255,0.03)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-accent)'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <span className={`doc-status ${mappedStatus}`} style={{ margin: 0 }}>
                    {mappedStatus}
                  </span>
                </div>

                <div style={{ flex: 1, marginTop: 4 }}>
                  <h4 className="doc-name" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 44 }}>
                    {doc.filename}
                  </h4>
                  <div style={{ display: 'flex', gap: 12, marginTop: 10, color: 'var(--text-secondary)', fontSize: 11 }}>
                    <div>
                      Pages: <strong>{doc.page_count}</strong>
                    </div>
                    <div>
                      Chunks: <strong>{doc.chunk_count}</strong>
                    </div>
                    <div>
                      Size: <strong>{doc.file_size_kb} KB</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setSelectedDoc(doc)}
                      title="View Details"
                      style={{ padding: 6, width: 30, height: 30, borderRadius: 'var(--radius-sm)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                      </svg>
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleReuploadClick(doc.id)}
                      title="Re-upload"
                      style={{ padding: 6, width: 30, height: 30, borderRadius: 'var(--radius-sm)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                      </svg>
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDelete(doc.id, doc.filename)}
                      title="Delete document"
                      style={{ padding: 6, width: 30, height: 30, borderRadius: 'var(--radius-sm)', borderColor: 'rgba(244,63,94,0.15)', color: 'var(--accent-rose)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      {selectedDoc && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease forwards'
        }}>
          <div className="modal-card glass-card" style={{
            width: '90%',
            maxWidth: 500,
            padding: 28,
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-card)',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Document Details</h3>
              <button
                className="btn btn-ghost"
                onClick={() => setSelectedDoc(null)}
                style={{ padding: 4, width: 28, height: 28, borderRadius: '50%' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label" style={{ fontSize: 10 }}>File Name</label>
                <div style={{ fontSize: 14, fontWeight: 500, wordBreak: 'break-all' }}>{selectedDoc.filename}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Ingestion Date</label>
                  <div style={{ fontSize: 13 }}>{new Date(selectedDoc.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Pipeline Status</label>
                  <span className={`doc-status ${selectedDoc.status === 'COMPLETED' ? 'ready' : selectedDoc.status === 'FAILED' ? 'failed' : 'processing'}`} style={{ display: 'inline-block', margin: '4px 0 0 0' }}>
                    {selectedDoc.status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Page Count</label>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedDoc.page_count}</div>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>Chunks Created</label>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedDoc.chunk_count}</div>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 10 }}>File Size</label>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedDoc.file_size_kb} KB</div>
                </div>
              </div>

              {selectedDoc.error_message && (
                <div style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)', borderRadius: 'var(--radius-md)', padding: 12, marginTop: 4 }}>
                  <label className="form-label" style={{ fontSize: 10, color: 'var(--accent-rose)' }}>Pipeline Error Log</label>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, wordBreak: 'break-word', fontFamily: 'monospace' }}>
                    {selectedDoc.error_message}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setSelectedDoc(null)} style={{ width: 'auto', padding: '10px 24px' }}>
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
