const API_BASE = '';

function getToken() {
  return localStorage.getItem('rag_token');
}

function setToken(token) {
  localStorage.setItem('rag_token', token);
}

function clearToken() {
  localStorage.removeItem('rag_token');
}

function getUsername() {
  return localStorage.getItem('rag_username') || '';
}

function setUsername(name) {
  localStorage.setItem('rag_username', name);
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    window.location.hash = '';
    throw new Error('Session expired. Please login again.');
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || 'Something went wrong');
  }

  return data;
}

// Auth
export async function register(username, password) {
  return apiFetch('/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username, password) {
  const data = await apiFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.access_token);
  setUsername(username);
  return data;
}

export function logout() {
  clearToken();
  localStorage.removeItem('rag_username');
}

export function isAuthenticated() {
  return !!getToken();
}

// Upload
export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch('/upload', {
    method: 'POST',
    body: formData,
  });
}

// Check document status
export async function getDocumentStatus(documentId) {
  return apiFetch(`/documents/${documentId}`);
}

// Ask question
export async function askQuestion(question, k = 4, similarityThreshold = 0.35) {
  return apiFetch('/ask', {
    method: 'POST',
    body: JSON.stringify({
      question,
      k,
      similarity_threshold: similarityThreshold,
    }),
  });
}

// Query logs
export async function getQueryLogs() {
  return apiFetch('/query_logs');
}

export { getToken, getUsername };
