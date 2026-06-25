import os
import json
from datetime import datetime
from typing import List, Dict, Any
from pymongo import MongoClient, ReturnDocument

# Global connection references
_client = None
_db = None

def get_mongo_db():
    """
    Exposes a global, thread-safe connection to the MongoDB database.
    """
    global _client, _db
    if _db is None:
        mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        db_name = os.environ.get("MONGO_DB_NAME", "rag_database")
        _client = MongoClient(mongo_uri)
        _db = _client[db_name]
    return _db

def set_mock_db(mock_db):
    """
    Injects a mock database client reference (used by mongomock during unit tests).
    """
    global _db
    _db = mock_db

def get_next_sequence_value(db, sequence_name: str) -> int:
    """
    Increments a named counter document and returns the new sequence value.
    This guarantees sequential integer IDs equivalent to SQLite AUTOINCREMENT.
    """
    result = db.counters.find_one_and_update(
        {"_id": sequence_name},
        {"$inc": {"sequence_value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )
    return result["sequence_value"]

def init_db(db_path: str = None):
    """
    Sets up the collection indexes for MongoDB to ensure query performance and uniqueness constraints.
    """
    db = get_mongo_db()
    # Unique index on users username
    db.users.create_index("username", unique=True)
    # Unique compound index on chunks user_id + chunk_index
    db.chunks.create_index([("user_id", 1), ("chunk_index", 1)], unique=True)
    # Compound search indexes for documents and logs
    db.chunks.create_index([("user_id", 1), ("document_name", 1)])
    db.query_logs.create_index([("user_id", 1), ("timestamp", -1)])
    db.documents.create_index([("user_id", 1), ("created_at", -1)])

def create_user(db_path: str, username: str, hashed_password: str) -> int:
    db = get_mongo_db()
    user_id = get_next_sequence_value(db, "user_id")
    db.users.insert_one({
        "id": user_id,
        "username": username,
        "hashed_password": hashed_password
    })
    return user_id

def get_user_by_username(db_path: str, username: str) -> Dict[str, Any]:
    db = get_mongo_db()
    row = db.users.find_one({"username": username})
    if row:
        return {
            "id": row["id"],
            "username": row["username"],
            "hashed_password": row["hashed_password"]
        }
    return None

def create_document(db_path: str, user_id: int, filename: str, status: str = "PENDING") -> int:
    db = get_mongo_db()
    doc_id = get_next_sequence_value(db, "document_id")
    db.documents.insert_one({
        "id": doc_id,
        "user_id": user_id,
        "filename": filename,
        "status": status,
        "error_message": None,
        "created_at": datetime.utcnow()
    })
    return doc_id

def update_document_status(db_path: str, document_id: int, status: str, error_message: str = None):
    db = get_mongo_db()
    db.documents.update_one(
        {"id": document_id},
        {"$set": {"status": status, "error_message": error_message}}
    )

def get_document(db_path: str, document_id: int) -> Dict[str, Any]:
    db = get_mongo_db()
    row = db.documents.find_one({"id": document_id})
    if row:
        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "filename": row["filename"],
            "status": row["status"],
            "error_message": row.get("error_message"),
            "created_at": row["created_at"]
        }
    return None

def save_chunks(db_path: str, user_id: int, chunks: List[Dict[str, Any]], clear_existing: bool = True, start_index: int = 0):
    db = get_mongo_db()
    if clear_existing:
        db.chunks.delete_many({"user_id": user_id})
        
    docs_to_insert = []
    for idx, chunk in enumerate(chunks):
        text = chunk.get("text", "")
        page_number = chunk.get("page_number", 0)
        doc_name = chunk.get("document_name", "unknown")
        chunk_index = start_index + idx
        
        docs_to_insert.append({
            "user_id": user_id,
            "chunk_index": chunk_index,
            "text": text,
            "page_number": page_number,
            "document_name": doc_name
        })
        
    if docs_to_insert:
        db.chunks.insert_many(docs_to_insert)

def fetch_chunks(db_path: str, user_id: int, faiss_indices: List[int]) -> List[Dict[str, Any]]:
    if not faiss_indices:
        return []
    db = get_mongo_db()
    cursor = db.chunks.find({
        "user_id": user_id,
        "chunk_index": {"$in": faiss_indices}
    })
    rows = list(cursor)
    
    row_map = {row["chunk_index"]: row for row in rows}
    ordered_results = []
    for idx in faiss_indices:
        if idx in row_map:
            r = row_map[idx]
            ordered_results.append({
                "chunk_index": r["chunk_index"],
                "text": r["text"],
                "page_number": r["page_number"],
                "document_name": r.get("document_name", "unknown")
            })
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
    db = get_mongo_db()
    log_id = get_next_sequence_value(db, "log_id")
    db.query_logs.insert_one({
        "id": log_id,
        "user_id": user_id,
        "query": query,
        "response": response,
        "retrieved_chunks": retrieved_info,
        "timestamp": datetime.utcnow(),
        "latency_ms": latency_ms,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens
    })

def get_query_count_last_hour(db_path: str, user_id: int) -> int:
    db = get_mongo_db()
    from datetime import timedelta
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    return db.query_logs.count_documents({
        "user_id": user_id,
        "timestamp": {"$gte": one_hour_ago}
    })

def get_query_logs(db_path: str, user_id: int) -> List[Dict[str, Any]]:
    db = get_mongo_db()
    cursor = db.query_logs.find({"user_id": user_id}).sort("timestamp", -1)
    results = []
    for r in cursor:
        results.append({
            "id": r["id"],
            "query": r["query"],
            "response": r["response"],
            "retrieved_chunks": json.dumps(r["retrieved_chunks"]),
            "timestamp": r["timestamp"].isoformat() + "Z" if isinstance(r["timestamp"], datetime) else str(r["timestamp"]),
            "latency_ms": r["latency_ms"],
            "prompt_tokens": r.get("prompt_tokens", 0),
            "completion_tokens": r.get("completion_tokens", 0)
        })
    return results

def delete_query_log(db_path: str, user_id: int, log_id: int):
    db = get_mongo_db()
    res = db.query_logs.delete_one({"id": log_id, "user_id": user_id})
    if res.deleted_count == 0:
        raise ValueError("Log entry not found or access denied")

def delete_document_by_id(db_path: str, user_id: int, document_id: int) -> str:
    db = get_mongo_db()
    doc = db.documents.find_one({"id": document_id, "user_id": user_id})
    if not doc:
        raise ValueError("Document not found or access denied")
    filename = doc["filename"]
    db.documents.delete_one({"id": document_id, "user_id": user_id})
    db.chunks.delete_many({"user_id": user_id, "document_name": filename})
    return filename

def list_documents(db_path: str, user_id: int) -> List[Dict[str, Any]]:
    db = get_mongo_db()
    docs_cursor = db.documents.find({"user_id": user_id}).sort("created_at", -1)
    results = []
    for d in docs_cursor:
        filename = d["filename"]
        chunk_count = db.chunks.count_documents({"user_id": user_id, "document_name": filename})
        
        max_page_row = db.chunks.find_one(
            {"user_id": user_id, "document_name": filename},
            sort=[("page_number", -1)],
            projection={"page_number": 1}
        )
        max_page = max_page_row["page_number"] if max_page_row else (1 if d["status"] == "COMPLETED" else 0)
        sim_size = round((chunk_count or 0) * 0.45 + 15.2, 1)
        created_at_str = d["created_at"].isoformat() + "Z" if isinstance(d["created_at"], datetime) else str(d["created_at"])
        
        results.append({
            "id": d["id"],
            "filename": d["filename"],
            "status": d["status"],
            "error_message": d.get("error_message"),
            "created_at": created_at_str,
            "chunk_count": chunk_count,
            "page_count": max_page,
            "file_size_kb": sim_size
        })
    return results

def rebuild_vector_store_chunks(db_path: str, user_id: int) -> List[Dict[str, Any]]:
    db = get_mongo_db()
    cursor = db.chunks.find({"user_id": user_id}).sort("chunk_index", 1)
    return [{"text": c["text"], "page_number": c["page_number"], "document_name": c.get("document_name", "unknown")} for c in cursor]

def reset_chunk_indices(db_path: str, user_id: int):
    db = get_mongo_db()
    cursor = db.chunks.find({"user_id": user_id}).sort("_id", 1)
    for new_idx, doc in enumerate(cursor):
        db.chunks.update_one({"_id": doc["_id"]}, {"$set": {"chunk_index": new_idx}})

def get_analytics_data(db_path: str, user_id: int) -> Dict[str, Any]:
    db = get_mongo_db()
    
    # 1. Totals aggregation
    pipeline_totals = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id": None,
            "total_queries": {"$sum": 1},
            "total_prompt": {"$sum": "$prompt_tokens"},
            "total_completion": {"$sum": "$completion_tokens"},
            "avg_latency": {"$avg": "$latency_ms"}
        }}
    ]
    totals = list(db.query_logs.aggregate(pipeline_totals))
    if totals:
        t = totals[0]
        total_queries = t.get("total_queries", 0)
        total_prompt = t.get("total_prompt", 0)
        total_completion = t.get("total_completion", 0)
        avg_latency = t.get("avg_latency", 0.0)
    else:
        total_queries = 0
        total_prompt = 0
        total_completion = 0
        avg_latency = 0.0
        
    # 2. Hourly queries count
    from datetime import timedelta
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    hourly_queries = db.query_logs.count_documents({
        "user_id": user_id,
        "timestamp": {"$gte": one_hour_ago}
    })
    
    # 3. Daily queries trend
    pipeline_daily = [
        {"$match": {"user_id": user_id}},
        {"$project": {
            "day": {
                "$dateToString": {
                    "format": "%Y-%m-%d",
                    "date": "$timestamp"
                }
            }
        }},
        {"$group": {
            "_id": "$day",
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}},
        {"$limit": 30}
    ]
    daily_rows = list(db.query_logs.aggregate(pipeline_daily))
    daily_queries = [{"date": r["_id"], "queries": r["count"]} for r in daily_rows]
    
    # 4. Success rate
    fallback_str = "I'm sorry, but the provided document does not contain enough information"
    fallback_count = db.query_logs.count_documents({
        "user_id": user_id,
        "response": {"$regex": fallback_str, "$options": "i"}
    })
    success_count = total_queries - fallback_count
    success_rate = (success_count / total_queries * 100) if total_queries > 0 else 100.0
    
    # 5. Latency ranges
    latency_ranges = {
        "<500ms": 0,
        "500-1000ms": 0,
        "1000-2000ms": 0,
        "2000-3000ms": 0,
        ">3000ms": 0
    }
    latencies = [doc["latency_ms"] for doc in db.query_logs.find({"user_id": user_id}, {"latency_ms": 1})]
    for lat in latencies:
        if lat < 500:
            latency_ranges["<500ms"] += 1
        elif lat < 1000:
            latency_ranges["500-1000ms"] += 1
        elif lat < 2000:
            latency_ranges["1000-2000ms"] += 1
        elif lat < 3000:
            latency_ranges["2000-3000ms"] += 1
        else:
            latency_ranges[">3000ms"] += 1
    latency_histogram = [{"range": k, "count": v} for k, v in latency_ranges.items()]
    
    # 6. Top documents
    doc_counts = {}
    logs_chunks = db.query_logs.find({"user_id": user_id}, {"retrieved_chunks": 1})
    for r in logs_chunks:
        chunks_meta = r.get("retrieved_chunks", [])
        seen_in_query = set()
        for c in chunks_meta:
            doc_name = c.get("document_name")
            if doc_name and doc_name not in seen_in_query:
                seen_in_query.add(doc_name)
                doc_counts[doc_name] = doc_counts.get(doc_name, 0) + 1
                
    top_documents = sorted([{"name": k, "queries": v} for k, v in doc_counts.items()], key=lambda x: x["queries"], reverse=True)[:5]
    
    prompt_rate = 0.59 / 1_000_000
    completion_rate = 0.79 / 1_000_000
    estimated_cost = (total_prompt * prompt_rate) + (total_completion * completion_rate)
    
    return {
        "total_queries": total_queries,
        "total_prompt_tokens": total_prompt,
        "total_completion_tokens": total_completion,
        "total_tokens": total_prompt + total_completion,
        "avg_latency_ms": round(avg_latency, 1),
        "success_rate": round(success_rate, 1),
        "estimated_cost_usd": round(estimated_cost, 6),
        "daily_queries": daily_queries,
        "latency_histogram": latency_histogram,
        "top_documents": top_documents,
        "hourly_queries": hourly_queries
    }

def verify_document_ownership(db_path: str, user_id: int, filename: str) -> bool:
    db = get_mongo_db()
    doc = db.documents.find_one({"user_id": user_id, "filename": filename})
    return doc is not None
