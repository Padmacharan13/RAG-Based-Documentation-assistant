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
    Initializes the SQLite database, creating the chunks and query_logs tables if they don't exist.
    """
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    
    # Create chunks table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chunk_index INTEGER UNIQUE,
            text TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            document_name TEXT
        )
    """)
    
    # Create query_logs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS query_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            response TEXT,
            retrieved_chunks TEXT, -- JSON string storing chunk metadata & similarity scores
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()

def save_chunks(db_path: str, chunks: List[Dict[str, Any]], clear_existing: bool = True):
    """
    Saves a list of document chunks to the chunks table.
    Each chunk dict must contain 'text' and 'page_number'. Optional 'document_name'.
    If clear_existing is True, clears the chunks table first.
    """
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    
    if clear_existing:
        cursor.execute("DELETE FROM chunks")
        
    for idx, chunk in enumerate(chunks):
        text = chunk.get("text", "")
        page_number = chunk.get("page_number", 0)
        doc_name = chunk.get("document_name", "unknown")
        
        # chunk_index corresponds to the insertion order matching FAISS index
        cursor.execute(
            "INSERT OR REPLACE INTO chunks (chunk_index, text, page_number, document_name) VALUES (?, ?, ?, ?)",
            (idx, text, page_number, doc_name)
        )
        
    conn.commit()
    conn.close()

def fetch_chunks(db_path: str, faiss_indices: List[int]) -> List[Dict[str, Any]]:
    """
    Fetches chunks from the database matching the provided list of FAISS index IDs.
    Returns them in the order of the requested indices.
    """
    if not faiss_indices:
        return []
        
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    
    # SQLite IN operator query
    placeholders = ",".join("?" for _ in faiss_indices)
    query = f"SELECT chunk_index, text, page_number, document_name FROM chunks WHERE chunk_index IN ({placeholders})"
    
    cursor.execute(query, faiss_indices)
    rows = cursor.fetchall()
    conn.close()
    
    # Map by chunk_index to preserve the FAISS retrieval rank ordering
    row_map = {row["chunk_index"]: dict(row) for row in rows}
    
    ordered_results = []
    for idx in faiss_indices:
        if idx in row_map:
            ordered_results.append(row_map[idx])
            
    return ordered_results

def log_query(db_path: str, query: str, response: str, retrieved_info: List[Dict[str, Any]]):
    """
    Logs the user query, LLM response, and retrieved chunks metadata (with similarity scores) to the database.
    """
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    
    retrieved_chunks_json = json.dumps(retrieved_info)
    
    cursor.execute(
        "INSERT INTO query_logs (query, response, retrieved_chunks) VALUES (?, ?, ?)",
        (query, response, retrieved_chunks_json)
    )
    
    conn.commit()
    conn.close()
