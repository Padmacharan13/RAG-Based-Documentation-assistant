# RAG-Based Documentation Assistant

A lightweight, secure, and production-ready Retrieval-Augmented Generation (RAG) system featuring a modular FastAPI backend and an interactive, modern React + Vite frontend. The system supports multi-user private indexing, asynchronous background document processing, similarity-based short-circuiting, citation parsing, and query transaction logging.

---

## 🏗️ Architecture & Pipeline Workflow

The project is structured as a clean, transparent, and custom-built RAG pipeline without heavy framing libraries (like LangChain), giving you complete control over extraction, storage, and retrieval.

```
d:\RAG-based Documentation Assistant/
├── app.py                 # FastAPI Web Server (Auth, upload, ask, & logs endpoints)
├── rag_database.db        # SQLite Database (Stores user info, document states, chunks, and logs)
├── vector_store_db/       # Serialized user-partitioned FAISS index files
├── requirements.txt       # Python dependencies
├── src/                   # Python package containing RAG pipeline modules
│   ├── __init__.py        # Exposes public classes and functions
│   ├── auth.py            # Password hashing (bcrypt) and JWT token operations
│   ├── extractor.py       # PDF Text Page-by-Page Extraction
│   ├── chunker.py         # Token-based Text Chunking
│   ├── embedder.py        # Sentence Embeddings Generator (L2 Normalized)
│   ├── vector_store.py    # FAISS Vector Storage & Search
│   ├── database.py        # SQLite Database Interface (Users, Docs, Chunks, Query Logs)
│   ├── generator.py       # Groq LLM Client & citation regex parser
│   └── pipeline.py        # RAG pipeline orchestrator
└── frontend/              # Interactive React + Vite SPA
    ├── src/
    │   ├── api.js         # API client & auth tokens management
    │   ├── App.jsx        # Main application router
    │   ├── components/    # ParticleCanvas, Sidebar, Toast, etc.
    │   └── pages/         # AuthPage, DashboardPage, ChatPage, LogsPage
    └── vite.config.js     # Dev server proxy configuration
```

---

## 🔄 The RAG Pipeline

The application splits its work into two primary pipelines: the **Ingestion Pipeline** and the **Retrieval & Generation Loop**.

```
                       INGESTION PIPELINE
[PDF File] ➔ PDFExtractor ➔ TokenChunker ➔ DocumentEmbedder ➔ FAISS Index & SQLite

                    RETRIEVAL & GENERATION LOOP
[User Query] ➔ Embed Query ➔ Search FAISS ➔ Cosine Similarity Threshold Check
                                                  │
                      ┌───────────────────────────┴───────────────────────────┐
            [Below Threshold (< 0.35)]                               [Above Threshold (>= 0.35)]
                      │                                                       │
                      ▼                                                       ▼
            Short-circuit pipeline                               Fetch Chunks from SQLite DB
         (Return Fallback Response)                                           │
                                                                              ▼
                                                                  Orchestrate Prompt for LLM
                                                                              │
                                                                              ▼
                                                                   Query LLM (Groq API)
                                                                              │
                                                                              ▼
                                                                   Parse Citations & Log Query
                                                                              │
                                                                              ▼
                                                                   Send Segmented Response
```

### 1. Ingestion Pipeline
* **Text Extraction (`src/extractor.py`)**: Page-by-page text parsing from PDF uploads using `pypdf`.
* **Token-based Chunking (`src/chunker.py`)**: Splits the extracted text into chunks based on token lengths (default: 100 tokens with an overlap of 15 tokens) using the SentenceTransformer tokenizer.
* **L2-Normalized Embeddings (`src/embedder.py`)**: Generates 384-dimensional vector embeddings for each text chunk using the `all-MiniLM-L6-v2` transformer model. The vectors are L2-normalized so that cosine similarity can be calculated efficiently from Euclidean distances.
* **Partitioned Vector Indexing (`src/vector_store.py`)**: Indexes vectors in a user-partitioned FAISS database, saved under `vector_store_db/{user_id}/`. This keeps vectors segregated by account.
* **Metadata Database Storage (`src/database.py`)**: Stores raw chunk text, source page numbers, document names, and user ownership mapping in SQLite (`rag_database.db`).

### 2. Retrieval & Generation (RAG) Loop
* **User Query Embedding**: The user's query is embedded into a 384-dimensional vector using the same `all-MiniLM-L6-v2` model.
* **Cosine Similarity & Thresholding**: Finds the top $K$ closest chunks from the user's FAISS index. Distance values are converted into Cosine Similarity scores using:
  $$\text{Cosine Similarity} = 1.0 - \frac{d^2}{2.0}$$
  If the top similarity score is below the configured threshold (default `0.35`), the orchestrator short-circuits the pipeline, bypasses the LLM to save cost and latency, and returns a clean fallback answer.
* **Context Generation & Groq LLM API (`src/generator.py`)**: If the chunks are relevant, raw text chunks are retrieved from SQLite and formatted into a system prompt. The query is processed by Groq's `llama-3.3-70b-versatile` running at a deterministic `temperature=0.0`.
* **Citation Resolution**: The LLM is instructed to cite source claims using `[Source N]`. A custom regex parser replaces these tokens with formatted `[Page X]` page markers and extracts structured references containing chunk text and page numbers.
* **Transaction Logging**: Saves each interaction (query, LLM response, retrieved chunks with scores, token usage, and latency) in the database (`query_logs` table) for monitoring and auditing.

---

## 🔑 Authentication & Security
* **Password Security (`src/auth.py`)**: User passwords are encrypted with `bcrypt` (safely truncated to the 72-byte hashing limit).
* **Stateless JWT Session**: FastAPI issues JSON Web Tokens upon successful login (`POST /login`). These tokens are stored securely in the browser's `localStorage` and sent in the `Authorization: Bearer <token>` header for protected endpoints (`/upload`, `/ask`, `/query_logs`).
* **Rate Limiting**: Limits the number of query executions (`/ask`) per hour (configurable via `RATE_LIMIT_PER_HOUR` in `.env`) to prevent resource abuse.

---

## 🚀 Setup & Execution Guide

### Prerequisites
* **Python 3.8+** (tested on 3.11 and 3.12)
* **Node.js v18+ & npm v9+**
* **Groq API Key** (Get one at the [Groq Console](https://console.groq.com/))

---

### 1. Environment Configuration

Create a `.env` file in the root directory (based on the template below) to manage project settings:

```env
# Groq LLM API Configuration
GROQ_API_KEY="your_groq_api_key_here"

# Database Configuration
DATABASE_PATH="rag_database.db"
VECTOR_DB_DIR="vector_store_db"

# FastAPI Server Settings
API_HOST="127.0.0.1"
API_PORT=8000

# Security Configuration
JWT_SECRET_KEY="generate_a_long_random_hex_string_here"
RATE_LIMIT_PER_HOUR=60
```

---

### 2. Backend Installation & Start

1. Initialize a Python virtual environment:
   ```bash
   python -m venv .venv
   ```
2. Activate the virtual environment:
   * **Windows (PowerShell)**: `.venv\Scripts\Activate.ps1`
   * **Windows (CMD)**: `.venv\Scripts\activate.bat`
   * **macOS / Linux**: `source .venv/bin/activate`
3. Install backend dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```
4. Start the FastAPI server using Uvicorn:
   ```bash
   uvicorn app:app --reload --port 8000
   ```
   The backend API will be running at `http://localhost:8000`. You can access interactive documentation at `http://localhost:8000/docs`.

---

### 3. Frontend Installation & Start

1. Open a new terminal and navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Launch the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend will run at `http://localhost:5173`. 

Open `http://localhost:5173` in your browser. You can now register an account, login, upload PDFs, ask questions with real-time similarity visualization, and view your queries audit log!