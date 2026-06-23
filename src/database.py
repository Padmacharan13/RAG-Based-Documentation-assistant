import sqlite3
import json
import os
from typing import List, Dict, Any

def get_db_connection(db_path: str) -> sqlite3.Connection:
    """
    Establishes a connection to the SQLite database.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path: str):
    """
    Initializes the SQLite database, creating the users, chunks, query_logs, and documents tables.
    If the tables exist in the old format (without user_id), resets them automatically.
    """
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    
    # Schema check: if chunks has index but no user_id column, we drop tables to perform reset
    try:
        cursor.execute("PRAGMA table_info(chunks)")
        columns = [col[1] for col in cursor.fetchall()]
        if columns and "user_id" not in columns:
            print("Detected old schema. Resetting database tables for multi-user support...")
            cursor.execute("DROP TABLE IF EXISTS chunks")
            cursor.execute("DROP TABLE IF EXISTS query_logs")
    except Exception as e:
        print(f"Error checking schema: {e}")

    # Create users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL
        )
    """)
    
    # Create chunks table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            text TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            document_name TEXT,
            UNIQUE(user_id, chunk_index)
        )
    """)
    
    # Create query_logs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS query_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            query TEXT NOT NULL,
            response TEXT,
            retrieved_chunks TEXT, -- JSON string storing chunk metadata & similarity scores
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            latency_ms REAL NOT NULL,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0
        )
    """)

    # Create documents table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            status TEXT NOT NULL, -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()

def save_chunks(db_path: str, user_id: int, chunks: List[Dict[str, Any]], clear_existing: bool = True, start_index: int = 0):
    """
    Saves a list of document chunks to the chunks table for a specific user_id.
    Each chunk dict must contain 'text' and 'page_number'. Optional 'document_name'.
    If clear_existing is True, clears the user's existing chunks first.
    """
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    
    if clear_existing:
        cursor.execute("DELETE FROM chunks WHERE user_id = ?", (user_id,))
        
    for idx, chunk in enumerate(chunks):
        text = chunk.get("text", "")
        page_number = chunk.get("page_number", 0)
        doc_name = chunk.get("document_name", "unknown")
        chunk_index = start_index + idx
        
        # chunk_index corresponds to the insertion order matching FAISS index
        cursor.execute(
            "INSERT OR REPLACE INTO chunks (user_id, chunk_index, text, page_number, document_name) VALUES (?, ?, ?, ?, ?)",
            (user_id, chunk_index, text, page_number, doc_name)
        )
        
    conn.commit()
    conn.close()

def fetch_chunks(db_path: str, user_id: int, faiss_indices: List[int]) -> List[Dict[str, Any]]:
    """
    Fetches chunks from the database matching the provided list of FAISS index IDs and user_id.
    Returns them in the order of the requested indices.
    """
    if not faiss_indices:
        return []
        
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    
    # SQLite IN operator query
    placeholders = ",".join("?" for _ in faiss_indices)
    query = f"SELECT chunk_index, text, page_number, document_name FROM chunks WHERE user_id = ? AND chunk_index IN ({placeholders})"
    
    cursor.execute(query, [user_id] + faiss_indices)
    rows = cursor.fetchall()
    conn.close()
    
    # Map by chunk_index to preserve the FAISS retrieval rank ordering
    row_map = {row["chunk_index"]: dict(row) for row in rows}
    
    ordered_results = []
    for idx in faiss_indices:
        if idx in row_map:
            ordered_results.append(row_map[idx])
            
    return ordered_results

def log_query(
    db_path: str,
    user_id: int,
    query: str,
    response: str,
    retrieved_info: List[Dict[str, Any]],
    latency_ms: float,
    prompt_tokens: int = 0,
    completion_tokens: int = 0
):
    """
    Logs the user query, LLM response, and retrieved chunks metadata (with similarity scores) to the database.
    """
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    
    retrieved_chunks_json = json.dumps(retrieved_info)
    
    cursor.execute(
        "INSERT INTO query_logs (user_id, query, response, retrieved_chunks, latency_ms, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, query, response, retrieved_chunks_json, latency_ms, prompt_tokens, completion_tokens)
    )
    
    conn.commit()
    conn.close()

# User helper functions
def create_user(db_path: str, username: str, hashed_password: str) -> int:
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, hashed_password) VALUES (?, ?)",
            (username, hashed_password)
        )
        user_id = cursor.lastrowid
        conn.commit()
        return user_id
    finally:
        conn.close()

def get_user_by_username(db_path: str, username: str) -> Dict[str, Any]:
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, hashed_password FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

# Document helper functions
def create_document(db_path: str, user_id: int, filename: str, status: str = "PENDING") -> int:
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO documents (user_id, filename, status) VALUES (?, ?, ?)",
        (user_id, filename, status)
    )
    doc_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return doc_id

def update_document_status(db_path: str, document_id: int, status: str, error_message: str = None):
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE documents SET status = ?, error_message = ? WHERE id = ?",
        (status, error_message, document_id)
    )
    conn.commit()
    conn.close()

def get_document(db_path: str, document_id: int) -> Dict[str, Any]:
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, user_id, filename, status, error_message, created_at FROM documents WHERE id = ?", (document_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None
