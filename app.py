import os
import sqlite3
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

from src.embedder import DocumentEmbedder
from src.vector_store import FAISSVectorStore
from src.generator import GroqGenerator
from src.pipeline import RAGPipeline

# Load environment variables from .env if present
load_dotenv()

app = FastAPI(
    title="RAG-Based Documentation Assistant API",
    description="Week 2: Retrieval & Generation loop using Cosine Similarity, SQLite database metadata, and Groq's LLM."
)

# Constants
DB_PATH = "rag_database.db"
VECTOR_DB_DIR = "vector_store_db"

# Global pipeline instance
pipeline = None

class AskRequest(BaseModel):
    question: str
    k: int = 4
    similarity_threshold: float = 0.35

@app.on_event("startup")
def startup_event():
    global pipeline
    try:
        print("Initializing RAG Pipeline components...")
        embedder = DocumentEmbedder()
        vector_store = FAISSVectorStore()
        
        # Load FAISS index if it exists on disk
        if os.path.exists(VECTOR_DB_DIR) and os.listdir(VECTOR_DB_DIR):
            vector_store.load(VECTOR_DB_DIR)
            print(f"Loaded FAISS index from '{VECTOR_DB_DIR}' ({vector_store.index.ntotal} vectors).")
        else:
            print(f"Warning: FAISS index directory '{VECTOR_DB_DIR}' not found or empty.")
            
        # Check Groq API Key availability
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            print("WARNING: GROQ_API_KEY environment variable is not set. LLM calls will fail.")
            
        # Instantiate Groq Generator (if API key is missing, this will warning-log or raise on first usage)
        generator = GroqGenerator(api_key=api_key)
        
        pipeline = RAGPipeline(
            embedder=embedder,
            vector_store=vector_store,
            generator=generator,
            db_path=DB_PATH
        )
        print("RAG Pipeline successfully initialized.")
    except Exception as e:
        print(f"Failed to initialize components during startup: {e}")

@app.post("/ask")
def ask(request: AskRequest):
    global pipeline
    if not pipeline:
        raise HTTPException(
            status_code=503,
            detail="RAG Pipeline is not initialized. Please verify startup logs."
        )
        
    if not pipeline.vector_store.index or pipeline.vector_store.index.ntotal == 0:
        raise HTTPException(
            status_code=400,
            detail="The vector database index is empty. Please run document ingestion first."
        )
        
    try:
        response = pipeline.query(
            question=request.question,
            k=request.k,
            similarity_threshold=request.similarity_threshold
        )
        return response
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred during retrieval/generation: {str(e)}"
        )

@app.get("/query_logs")
def get_query_logs():
    """
    Utility endpoint to retrieve query logging entries stored in SQLite.
    """
    if not os.path.exists(DB_PATH):
        return {"logs": []}
        
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id, query, response, retrieved_chunks, timestamp FROM query_logs ORDER BY timestamp DESC")
        rows = cursor.fetchall()
        conn.close()
        
        logs = []
        for r in rows:
            logs.append({
                "id": r["id"],
                "query": r["query"],
                "response": r["response"],
                "retrieved_chunks": r["retrieved_chunks"],
                "timestamp": r["timestamp"]
            })
        return {"logs": logs}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch query logs: {str(e)}"
        )
