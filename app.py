from dotenv import load_dotenv
# Load environment variables from .env if present
load_dotenv()

import os
import shutil
import sqlite3
from typing import Dict, Any
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, BackgroundTasks, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field

from src.embedder import DocumentEmbedder
from src.vector_store import FAISSVectorStore
from src.generator import GroqGenerator
from src.pipeline import RAGPipeline
from src.extractor import PDFExtractor
from src.chunker import TokenChunker
from src.database import (
    init_db,
    save_chunks,
    get_db_connection,
    create_user,
    get_user_by_username,
    create_document,
    update_document_status,
    get_document
)
from src.auth import hash_password, verify_password, create_access_token, decode_access_token
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="RAG-Based Documentation Assistant API",
    description="Multi-user secure RAG assistant with private vector indexing, rate limiting, and background uploads."
)

# CORS middleware for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants
DB_PATH = "rag_database.db"
VECTOR_DB_DIR = "vector_store_db"
UPLOADS_DIR = "uploads"

# Global components (initialized at startup)
global_embedder = None
global_generator = None

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Pydantic schemas
class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class AskRequest(BaseModel):
    question: str
    k: int = 4
    similarity_threshold: float = 0.35

# Dependency to get current user from JWT token
def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = decode_access_token(token)
        user_id_str = payload.get("sub")
        username = payload.get("username")
        if not user_id_str or not username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        return {"user_id": int(user_id_str), "username": username}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )

# Background task for document ingestion
def process_document_task(user_id: int, document_id: int, file_path: str, filename: str):
    try:
        # 1. Update status to PROCESSING
        update_document_status(DB_PATH, document_id, "PROCESSING")
        
        # 2. Extract pages
        extractor = PDFExtractor(file_path)
        extracted_pages = extractor.extract_pages()
        if not extracted_pages:
            raise ValueError("No text could be extracted from this PDF document.")
            
        # 3. Chunk text
        chunker = TokenChunker(
            model_name="sentence-transformers/all-MiniLM-L6-v2", 
            chunk_size=100, 
            overlap=15
        )
        chunks = chunker.chunk_all_pages(extracted_pages)
        if not chunks:
            raise ValueError("No text chunks were generated.")
            
        # 4. Generate embeddings
        chunk_texts = [c["text"] for c in chunks]
        embeddings = global_embedder.embed_chunks(chunk_texts)
        
        # 5. Partition FAISS vector index
        user_dir = os.path.join(VECTOR_DB_DIR, str(user_id))
        vector_store = FAISSVectorStore(dimension=global_embedder.embedding_dimension)
        if os.path.exists(user_dir) and os.listdir(user_dir):
            vector_store.load(user_dir)
            
        start_index = len(vector_store.metadata)
        
        # Enrich chunks with document name metadata
        for chunk in chunks:
            chunk["document_name"] = filename
            
        vector_store.add_documents(embeddings, chunks)
        vector_store.save(user_dir)
        
        # 6. Save metadata chunks to SQLite database
        save_chunks(DB_PATH, user_id, chunks, clear_existing=False, start_index=start_index)
        
        # 7. Update status to COMPLETED
        update_document_status(DB_PATH, document_id, "COMPLETED")
    except Exception as e:
        print(f"Error processing document {filename} for user {user_id}: {e}")
        update_document_status(DB_PATH, document_id, "FAILED", error_message=str(e))
    finally:
        # Cleanup temporary uploaded file
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as cleanup_err:
                print(f"Failed to delete temp file {file_path}: {cleanup_err}")

@app.on_event("startup")
def startup_event():
    global global_embedder, global_generator
    try:
        print("Initializing SQLite Database...")
        init_db(DB_PATH)
        
        print("Initializing DocumentEmbedder...")
        global_embedder = DocumentEmbedder()
        
        print("Initializing GroqGenerator...")
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            print("WARNING: GROQ_API_KEY environment variable is not set. LLM calls will fail.")
        global_generator = GroqGenerator(api_key=api_key)
        
        print("FastAPI startup initialization complete.")
    except Exception as e:
        print(f"Failed to initialize components during startup: {e}")

# Authentication Endpoints
@app.post("/register", status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest):
    user = get_user_by_username(DB_PATH, request.username)
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    hashed = hash_password(request.password)
    user_id = create_user(DB_PATH, request.username, hashed)
    return {"message": "User registered successfully", "user_id": user_id}

@app.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    user = get_user_by_username(DB_PATH, request.username)
    if not user or not verify_password(request.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
        
    token = create_access_token(user["id"], user["username"])
    return {"access_token": token, "token_type": "bearer"}

# Upload Endpoint
@app.post("/upload", status_code=status.HTTP_202_ACCEPTED)
def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents are supported."
        )
        
    user_id = current_user["user_id"]
    
    # Save the file to a temp location inside uploads/{user_id}/
    user_upload_dir = os.path.join(UPLOADS_DIR, str(user_id))
    os.makedirs(user_upload_dir, exist_ok=True)
    
    temp_file_path = os.path.join(user_upload_dir, file.filename)
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Write initial pending document state to SQLite database
    document_id = create_document(DB_PATH, user_id, file.filename, "PENDING")
    
    # Delegate extraction, embedding, and indexing to background thread
    background_tasks.add_task(
        process_document_task,
        user_id=user_id,
        document_id=document_id,
        file_path=temp_file_path,
        filename=file.filename
    )
    
    return {
        "document_id": document_id,
        "filename": file.filename,
        "status": "PENDING",
        "message": "Ingestion task queued in the background."
    }

# Document Status Endpoint
@app.get("/documents/{document_id}")
def check_document_status(
    document_id: int,
    current_user: dict = Depends(get_current_user)
):
    doc = get_document(DB_PATH, document_id)
    if not doc or doc["user_id"] != current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )
        
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "status": doc["status"],
        "error_message": doc["error_message"],
        "created_at": doc["created_at"]
    }

# Query Endpoint
@app.post("/ask")
def ask(
    request: AskRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user["user_id"]
    
    # 1. Rate Limiting check (capped per hour)
    rate_limit = int(os.environ.get("RATE_LIMIT_PER_HOUR", "60"))
    try:
        conn = get_db_connection(DB_PATH)
        cursor = conn.cursor()
        # Count queries in the last 1 hour
        cursor.execute(
            "SELECT COUNT(*) FROM query_logs WHERE user_id = ? AND timestamp >= datetime('now', '-1 hour')",
            (user_id,)
        )
        query_count = cursor.fetchone()[0]
        conn.close()
    except Exception as e:
        print(f"Error checking rate limit: {e}")
        query_count = 0
        
    if query_count >= rate_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit of {rate_limit} queries per hour exceeded."
        )
        
    # 2. Dynamically load/construct user-scoped vector store from disk
    user_dir = os.path.join(VECTOR_DB_DIR, str(user_id))
    vector_store = FAISSVectorStore(dimension=global_embedder.embedding_dimension)
    if os.path.exists(user_dir) and os.listdir(user_dir):
        try:
            vector_store.load(user_dir)
        except Exception as e:
            print(f"Error loading FAISS vector index for user {user_id}: {e}")
            
    # 3. Instantiate pipeline & query
    pipeline = RAGPipeline(
        embedder=global_embedder,
        vector_store=vector_store,
        generator=global_generator,
        db_path=DB_PATH
    )
    
    try:
        response = pipeline.query(
            user_id=user_id,
            question=request.question,
            k=request.k,
            similarity_threshold=request.similarity_threshold
        )
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during query processing: {str(e)}"
        )

# Query Logs Endpoint
@app.get("/query_logs")
def get_query_logs(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    try:
        conn = get_db_connection(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, query, response, retrieved_chunks, timestamp, latency_ms, prompt_tokens, completion_tokens "
            "FROM query_logs WHERE user_id = ? ORDER BY timestamp DESC",
            (user_id,)
        )
        rows = cursor.fetchall()
        conn.close()
        
        logs = []
        for r in rows:
            logs.append({
                "id": r["id"],
                "query": r["query"],
                "response": r["response"],
                "retrieved_chunks": r["retrieved_chunks"],
                "timestamp": r["timestamp"],
                "latency_ms": r["latency_ms"],
                "prompt_tokens": r["prompt_tokens"],
                "completion_tokens": r["completion_tokens"]
            })
        return {"logs": logs}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch query logs: {str(e)}"
        )
