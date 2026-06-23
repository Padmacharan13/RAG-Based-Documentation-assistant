# RAG-Based Documentation Assistant - Week 2 (Retrieval & Generation Loop)

This repository implements a modular, lightweight, and production-ready Retrieval-Augmented Generation (RAG) system for document QA. 

**Week 1** established the ingestion pipeline (PDF parsing, token-based chunking, SentenceTransformer embedding, and FAISS indexing). 
**Week 2** completes the core loop by adding **Cosine Similarity thresholding**, **SQLite metadata database storage**, **Groq LLM generation (`llama-3.3-70b-versatile`)**, **inline citation resolving**, **query transaction logging**, and a **FastAPI web server**.

---

## 🏗️ Architecture & Modules

The system is built as a pure-Python library with zero heavy framing wrappers (like LangChain) to keep details clean, transparent, and easy to extend.

```
d:\RAG-based Documentation Assistant/
├── .gitignore             # Git exclusion rules
├── requirements.txt       # Updated dependencies (pypdf, sentence-transformers, faiss-cpu, groq, fastapi, uvicorn, python-dotenv)
├── README.md              # Technical documentation & usage instructions
├── app.py                 # FastAPI Web Server (ask and logs endpoints)
├── test_rag_pipeline.py   # Ingestion verification script (Week 1 / SQLite updater)
├── test_week2_pipeline.py # End-to-end RAG verification script (Week 2 checkpoint)
├── vector_store_db/       # Serialized FAISS index files
├── rag_database.db        # SQLite database (stores chunks and query logs)
└── src/                   # Python package containing RAG pipeline modules
    ├── __init__.py        # Exposes public classes and functions
    ├── extractor.py       # PDF Text Page-by-Page Extraction
    ├── chunker.py         # Token-based Text Chunking
    ├── embedder.py        # Sentence Embeddings Generator (L2 Normalized)
    ├── vector_store.py    # FAISS Vector Storage & Search
    ├── database.py        # SQLite Database (chunks table + query transaction logs)
    ├── generator.py       # Groq LLM client & [Source N] citation regex parser
    └── pipeline.py        # RAG pipeline orchestrator
```

### Module Descriptions & Important Details

#### 1. SQLite Database Layer (`src/database.py`)
- **Responsibility**: Manages persistence for chunk text/page mappings and logs user query transactions.
- **Details**:
  - `chunks` table: Maps a `chunk_index` (matching its order in the FAISS index) to its raw `text`, `page_number`, and `document_name`. 
  - `query_logs` table: Stores query transactions, including query string, generated answer, and a JSON dump of retrieved chunks (with similarity scores) for analysis and debugging.

#### 2. L2-Normalized Embeddings (`src/embedder.py` & `src/vector_store.py`)
- **Responsibility**: Generates 384-dimensional dense vectors using `all-MiniLM-L6-v2`.
- **Details**: Activates L2 vector normalization. Since we normalize vectors, standard FAISS L2 Euclidean distance $d$ correlates to Cosine Similarity via:
  $$\text{Cosine Similarity} = 1.0 - \frac{d^2}{2.0}$$

#### 3. RAG Pipeline Orchestrator (`src/pipeline.py`)
- **Responsibility**: Coordinates embedding, searching, thresholding, database loading, and generation.
- **Details**:
  - Receives the query, embeds it, and searches FAISS.
  - Converts distances to Cosine Similarities and applies a `similarity_threshold` (default `0.35`).
  - **Short-circuiting**: If the closest matching chunk's similarity is below the threshold, it immediately logs and returns a fallback message (`"I'm sorry, but the provided document does not contain enough information to answer your question."`), bypassing the LLM to save latency and cost.
  - If relevant, fetches chunk texts and page numbers from SQLite, queries the generator, and logs the query transaction.

#### 4. Groq LLM Generation & Citation Parsing (`src/generator.py`)
- **Responsibility**: Generates responses using Groq's client library and parses citation markers.
- **Details**:
  - Prompts `llama-3.3-70b-versatile` at `temperature=0.0` with strict instructions to restrict itself to the context and cite claims using `[Source N]`.
  - Regular expressions parse `[Source N]` tags and map them back to the source page numbers fetched from the SQLite database.
  - Returns raw LLM text, a `clean_answer` (formatting tags like `[Page X]`), sorted unique `citations`, and structured `segments` (perfect for rendering clickable references in UIs).

#### 5. FastAPI Web Server (`app.py`)
- **Responsibility**: Exposes the pipeline via a REST API.
- **Endpoints**:
  - `POST /ask`: Accepts `{"question": "..."}`. Returns the segmented answer, clean answer, and citations.
  - `GET /query_logs`: Returns the transaction logs from the SQLite database.

---

## 🚀 Setup & Execution Guide

### Prerequisites
- Python 3.8+ (tested on Python 3.12)
- Groq API Key (Sign up at [Groq Console](https://console.groq.com/))

### 1. Installation
Clone the repository, initialize your virtual environment, and install the updated requirements:

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment (Windows PowerShell)
.venv\Scripts\activate

# Install dependencies
python -m pip install -r requirements.txt
```

### 2. Configure Your API Key
Supply your Groq API Key by setting the `GROQ_API_KEY` environment variable:

```bash
# Windows PowerShell
$env:GROQ_API_KEY="gsk_your_actual_key_here"

# Windows CMD
set GROQ_API_KEY="gsk_your_actual_key_here"

# Linux / macOS
export GROQ_API_KEY="gsk_your_actual_key_here"
```

### 3. Run Ingestion and Ingestion Verification
Run the Week 1 test pipeline to generate a dummy PDF, extract and chunk text, and populate the FAISS index and the SQLite database:

```bash
python test_rag_pipeline.py
```

### 4. Run the Week 2 Verification Checklist
Verify the entire retrieval, similarity calculations, threshold short-circuiting, citation parsing, and query logging in SQLite:

```bash
python test_week2_pipeline.py
```
*(Note: If `GROQ_API_KEY` is not set, this script runs in a **Mock LLM Mode** to safely verify parsing and database logging logic without crashing).*

### 5. Running the Web API
Start the FastAPI server using Uvicorn:

```bash
.venv\Scripts\uvicorn app:app --reload --port 8000
```

#### Test RAG Queries (`POST /ask`)
```bash
curl -X POST "http://127.0.0.1:8000/ask" \
     -H "Content-Type: application/json" \
     -d '{"question": "What is Retrieval-Augmented Generation?", "similarity_threshold": 0.35}'
```

#### View Logging Transactions (`GET /query_logs`)
```bash
curl http://127.0.0.1:8000/query_logs
```