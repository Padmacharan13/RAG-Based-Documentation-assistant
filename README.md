# RAG-Based Documentation Assistant - Week 1 Foundation

This project establishes the core ingestion pipeline and vector store foundation for a Retrieval-Augmented Generation (RAG) system. The pipeline extracts text page-by-page from PDF documents, splits the content into token-sized chunks with overlap, generates dense embeddings, indexes them using FAISS, and runs similarity search queries with precise page citations.

---

## 🏗️ Architecture & Modules

The system is built as a modular, pure-Python library with zero heavy framing wrappers (like LangChain) to keep details clean, transparent, and easy to extend.

```
d:\RAG-based Documentation Assistant/
├── .gitignore             # Git exclusion rules
├── requirements.txt       # Dependencies (pypdf, sentence-transformers, faiss-cpu, etc.)
├── test_rag_pipeline.py   # Standalone end-to-end verification script
└── src/                   # Python package containing pipeline modules
    ├── __init__.py
    ├── extractor.py       # PDF Text Extraction
    ├── chunker.py         # Token-based Text Chunking
    ├── embedder.py        # Sentence Embeddings Generator
    └── vector_store.py    # FAISS Vector Storage & Similarity Search
```

### Module Descriptions & Important Details

#### 1. Page-by-Page Extraction (`src/extractor.py`)
- **Responsibility**: Loads PDF documents and extracts raw text from each page.
- **Important Detail**: Maps every snippet of text to its original 1-based page number. This guarantees we preserve original page metadata throughout the pipeline, enabling correct document citations when an LLM later answers a query.

#### 2. Token-Based Chunking (`src/chunker.py`)
- **Responsibility**: Splits page text into manageable chunks of approximately 300–500 tokens.
- **Important Detail**:
  - Uses the actual `transformers` tokenizer corresponding to the `all-MiniLM-L6-v2` model. This prevents mismatching text lengths (as word or character counts do not reflect the actual input size accepted by the model).
  - Includes a customizable token overlap (e.g., 50 tokens) to ensure semantic context is not severed at chunk boundaries.
  - Chunks are processed page-by-page to keep page metadata perfectly aligned with the chunk text.

#### 3. Dense Vector Embeddings (`src/embedder.py`)
- **Responsibility**: Encodes text chunks into dense vector representations.
- **Important Detail**: Uses the `all-MiniLM-L6-v2` model from the `sentence-transformers` library, embedding each text chunk into a highly descriptive 384-dimensional vector space.

#### 4. FAISS Vector Storage (`src/vector_store.py`)
- **Responsibility**: Indexes vectors, maps them to chunk metadata, loads/saves the database to disk, and runs similarity searches.
- **Important Detail**:
  - Uses standard `faiss-cpu` flat index (`IndexFlatL2`) for exhaustive Euclidean distance similarity searches.
  - Binds vectors to metadata by maintaining a synchronized JSON mapping list (`metadata.json`) alongside the index file (`index.faiss`).
  - Implements robust database saving and loading functions.

---

## 🚀 Setup & Execution Guide

### Prerequisites
- Python 3.12 (or any compatible 3.8+ python environment)

### 1. Installation
Run the following commands in your terminal from the project root:

```bash
# Create a virtual environment
python -m venv .venv

# Activate the virtual environment (Windows Powershell)
.venv\Scripts\activate

# Install required dependencies
python -m pip install -r requirements.txt
```

### 2. Running the Verification Pipeline
The project comes with a built-in checkpoint script that verifies the full ingestion pipeline:

```bash
python test_rag_pipeline.py
```

### What `test_rag_pipeline.py` Does:
1. **Generates a Dummy PDF (`test_document.pdf`)** containing multi-page technical texts on:
   - Page 1: Artificial Intelligence Foundations
   - Page 2: Retrieval-Augmented Generation (RAG)
   - Page 3: Vector Databases and Similarity Search
2. **Runs Extraction & Chunking** to split pages into token lists.
3. **Embeds and Indexes** the chunks into the FAISS store.
4. **Saves the Store** to `vector_store_db/` and loads it back.
5. **Performs Queries** (e.g. *"What is Retrieval-Augmented Generation?"*) and retrieves the closest text chunks, printing the distance score and the **exact page citation** (e.g., `Source Page: 2`).