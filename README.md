# RAG-Based Documentation Assistant

A lightweight, secure, and production-ready Retrieval-Augmented Generation (RAG) system featuring a modular FastAPI backend and an interactive, modern React + Vite frontend. The system supports multi-user private indexing, asynchronous background document processing, similarity-based short-circuiting, citation parsing, query transaction logging, interactive visual analytics, and live token-by-token text streaming.

---

## 🏗️ Architecture & Pipeline Workflow

The project is structured as a clean, transparent, and custom-built RAG pipeline without heavy framing libraries (like LangChain), giving you complete control over extraction, storage, and retrieval.

```
d:\RAG-based Documentation Assistant/
├── app.py                 # FastAPI Web Server (Auth, upload, documents, ask, logs, & analytics)
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
    │   ├── App.jsx        # Main application view router
    │   ├── components/    # ParticleCanvas, Sidebar, Toast, etc.
    │   └── pages/         # DashboardPage, DocumentPage, ChatPage, AnalyticsPage, SettingsPage, AuthPage
    └── vite.config.js     # Dev server proxy configuration (register, login, ask, analytics, documents, logs)
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
* **L2-Normalized Embeddings (`src/embedder.py`)**: Generates 384-dimensional vector embeddings for each text chunk using the `all-MiniLM-L6-v2` transformer model.
* **Partitioned Vector Indexing (`src/vector_store.py`)**: Indexes vectors in a user-partitioned FAISS database, saved under `vector_store_db/{user_id}/`.
* **Metadata Database Storage (`src/database.py`)**: Stores raw chunk text, source page numbers, document names, and user ownership mapping in SQLite (`rag_database.db`).

### 2. Retrieval & Generation (RAG) Loop
* **Cosine Similarity & Thresholding**: Finds the top $K$ closest chunks from the user's FAISS index. If the top similarity score is below the configured threshold (default `0.35`), the orchestrator short-circuits the pipeline, bypasses the LLM to save cost, and returns a clean fallback answer.
* **Context Generation & Groq LLM API (`src/generator.py`)**: If the chunks are relevant, raw text chunks are retrieved from SQLite and formatted into a system prompt. The query is processed by Groq's `llama-3.3-70b-versatile` running at a deterministic `temperature=0.0`.
* **Citation Resolution**: The LLM is instructed to cite source claims using `[Source N]`. A custom regex parser replaces these tokens with formatted `[Page X]` page markers and extracts structured references containing chunk text and page numbers.
* **Source Inspector Hook**: Modifies RAG outputs to include full text chunks and scores in the query response dict, enabling the UI to load citations instantly.

---

## 🎨 Frontend Views & Features

### 1. Home Dashboard (`DashboardPage.jsx`)
* **Live System Metrics**: Shows document counts, queries executed this month, and relative time of the last query.
* **Recent Documents Grid**: Displays cards of recently uploaded PDFs showing chunk numbers and dates.
* **Onboarding Steps**: Displays a step-by-step interactive guide helping first-time users upload files, ask questions, and monitor tokens.

### 2. Document Manager (`DocumentPage.jsx`)
* **Ingestion Drag-and-Drop**: Visual file drops with progress loading bar percentage overlays. Transitions to a pulsing "Processing..." status while the backend embeds text chunks.
* **Status Badges**: Maps states to color-coded badges (`ready` for completed, `processing`, and `failed`).
* **Manage Actions**: Allows opening detailed information logs (pages, chunks, error messages), executing document deletes, or triggering instant re-uploads.

### 3. Collapsible 2-Column Chat (`ChatPage.jsx`)
* **Breadcrumb Scope**: Displays locked scope (`Document: "filename"`) with dropdowns to switch documents or search globally.
* **Token Streaming**: Word-by-word streaming responses with a flashing blinking typing cursor `▌`.
* **Clickable Page Citations**: Renders page citations as interactive citrus/cyan badges (`Page X`). Hovering highlights them; clicking opens the Source Inspector panel.
* **Citation/Source Inspector**: A slide-out panel on the right highlighting matching prompt terms in cited chunks, displaying cosine similarity metrics, and showing full chunk texts.
* **Session logs history**: Side-menu containing past query history with Keyword searches and deletion controls.
* **Reconnection state**: Tiny pulsing connection indicator (`Connected`, `Syncing...`, `Error`).

### 4. Recharts Visual Analytics (`AnalyticsPage.jsx`)
* **Daily Trend Area Chart**: Graphs query counts executed over a rolling 30-day window.
* **Latency Histogram**: Visualizes uvicorn server response distribution bins (`<500ms`, `500-1000ms`, `1000-2000ms`, etc.).
* **Token Allocations**: Stacked metrics showing prompt context inputs vs. completion output usage.
* ** Groq API Costs**: Breakdown calculations of expenses based on tokens consumed.
* **Top Sources list**: Tables showing most queried documents on your account.

### 5. Profile Settings (`SettingsPage.jsx`)
* **API limits**: Rolling hourly API request progress bars (e.g. `12 / 60 queries used`).
* **Theme switcher**: A quick-action light/dark mode theme toggler syncing variables globally.

---

## 🔑 Authentication & Security
* **Password Hashing (`src/auth.py`)**: User passwords are encrypted with `bcrypt`.
* **Stateless JWT Session**: Issues JSON Web Tokens on `/login`. Stored in browser `localStorage` and sent in authorization headers.
* **Hourly Rate Limiter**: Restricts query loads per hour (configurable via `RATE_LIMIT_PER_HOUR` in `.env`) to prevent Groq API exhaustion.

---

## 🚀 Setup & Execution Guide

### Prerequisites
* **Python 3.8+** (tested on 3.11 and 3.12)
* **Node.js v18+ & npm v9+**
* **Groq API Key** (Get one at the [Groq Console](https://console.groq.com/))

### 1. Environment Configuration
Create a `.env` file in the root directory:
```env
GROQ_API_KEY="your_groq_api_key_here"
DATABASE_PATH="rag_database.db"
VECTOR_DB_DIR="vector_store_db"
API_HOST="127.0.0.1"
API_PORT=8000
JWT_SECRET_KEY="generate_a_long_random_hex_string_here"
RATE_LIMIT_PER_HOUR=60
```

### 2. Backend Installation & Start
1. Initialize virtual environment:
   ```bash
   python -m venv .venv
   ```
2. Activate venv:
   * **Windows (PowerShell)**: `.venv\Scripts\Activate.ps1`
   * **macOS / Linux**: `source .venv/bin/activate`
3. Install dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```
4. Start server:
   ```bash
   uvicorn app:app --reload --port 8000
   ```

### 3. Frontend Installation & Start
1. Open a new terminal and navigate to `frontend/`:
   ```bash
   cd frontend
   ```
2. Install npm packages (including Recharts & Lucide):
   ```bash
   npm install --legacy-peer-deps
   ```
3. Run Vite dev server:
   ```bash
   npm run dev
   ```

Open `http://localhost:5173` in your browser. You can now register an account, login, upload PDFs, ask questions with real-time similarity visualization, and view your queries audit log!