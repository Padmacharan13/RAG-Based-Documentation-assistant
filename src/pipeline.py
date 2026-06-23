import numpy as np
import time
from typing import Dict, Any, List
from src.embedder import DocumentEmbedder
from src.vector_store import FAISSVectorStore
from src.generator import GroqGenerator
from src.database import fetch_chunks, log_query

class RAGPipeline:
    """
    Orchestrates the entire Retrieval and Generation loop.
    Takes a query, finds matching chunks using Cosine Similarity,
    filters by a threshold, retrieves texts from the SQLite database,
    generates a response using Groq, and logs the query transaction.
    """
    def __init__(
        self,
        embedder: DocumentEmbedder,
        vector_store: FAISSVectorStore,
        generator: GroqGenerator,
        db_path: str = "rag_database.db"
    ):
        self.embedder = embedder
        self.vector_store = vector_store
        self.generator = generator
        self.db_path = db_path

    def query(
        self,
        user_id: int,
        question: str,
        k: int = 4,
        similarity_threshold: float = 0.35
    ) -> Dict[str, Any]:
        """
        Executes the full RAG pipeline for a given user question and user_id.
        
        Args:
            user_id: The ID of the authenticated user.
            question: The user query string.
            k: The number of top documents to retrieve.
            similarity_threshold: Cosine similarity cutoff value.
            
        Returns:
            A dictionary containing answer, clean_answer, citations, and segments.
        """
        start_time = time.perf_counter()
        
        # Check if vector index exists and has items
        if not self.vector_store.index or self.vector_store.index.ntotal == 0:
            fallback_msg = "I'm sorry, but the provided document does not contain enough information to answer your question."
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            log_query(
                self.db_path,
                user_id=user_id,
                query=question,
                response=fallback_msg,
                retrieved_info=[],
                latency_ms=latency_ms,
                prompt_tokens=0,
                completion_tokens=0
            )
            return {
                "answer": fallback_msg,
                "clean_answer": fallback_msg,
                "citations": [],
                "segments": [{"type": "text", "content": fallback_msg}],
                "short_circuited": True
            }

        # 1. Embed query (the embedder should return an L2-normalized vector)
        query_vector = self.embedder.embed_query(question)
        
        # Reshape for FAISS search if necessary
        if len(query_vector.shape) == 1:
            query_f32 = np.expand_dims(query_vector, axis=0).astype(np.float32)
        else:
            query_f32 = query_vector.astype(np.float32)
            
        # 2. Search FAISS index
        # FAISS search returns (distances, indices)
        distances, indices = self.vector_store.index.search(query_f32, k)
        
        raw_indices = indices[0].tolist()
        raw_distances = distances[0].tolist()
        
        # Filter valid indices and calculate Cosine Similarity
        # For L2-normalized vectors, cosine_similarity = 1.0 - (L2_distance^2 / 2.0)
        valid_indices = []
        similarities = []
        
        for idx, dist in zip(raw_indices, raw_distances):
            if idx != -1:
                similarity = 1.0 - (dist / 2.0)
                similarity = max(-1.0, min(1.0, similarity))
                
                valid_indices.append(idx)
                similarities.append(similarity)
                
        # 3. Apply relevance threshold
        fallback_msg = "I'm sorry, but the provided document does not contain enough information to answer your question."
        
        if not similarities or similarities[0] < similarity_threshold:
            # Short-circuit immediately, bypass Groq LLM
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            log_query(
                self.db_path,
                user_id=user_id,
                query=question,
                response=fallback_msg,
                retrieved_info=[],
                latency_ms=latency_ms,
                prompt_tokens=0,
                completion_tokens=0
            )
            return {
                "answer": fallback_msg,
                "clean_answer": fallback_msg,
                "citations": [],
                "segments": [{"type": "text", "content": fallback_msg}],
                "short_circuited": True
            }
            
        # 4. Fetch chunk details (text + page numbers) from SQLite table matching user_id
        db_chunks = fetch_chunks(self.db_path, user_id, valid_indices)
        
        # Merge similarity scores into chunk metadata
        retrieved_chunks = []
        # Since db_chunks is loaded relative to valid_indices order, they match one-to-one
        for chunk in db_chunks:
            chunk_copy = dict(chunk)
            # Find the similarity score matching this chunk's index
            try:
                idx_pos = valid_indices.index(chunk["chunk_index"])
                chunk_copy["similarity"] = similarities[idx_pos]
            except ValueError:
                chunk_copy["similarity"] = 0.0
            retrieved_chunks.append(chunk_copy)
            
        # 5. LLM Generation via Groq
        prompt_tokens = 0
        completion_tokens = 0
        try:
            raw_response, prompt_tokens, completion_tokens = self.generator.generate_response(question, retrieved_chunks)
        except Exception as e:
            raw_response = f"Error generating response: {str(e)}"
            
        # 6. Parse and resolve [Source N] citation tags
        parsed_result = self.generator.parse_citations(raw_response, retrieved_chunks)
        parsed_result["short_circuited"] = False
        
        # 7. Log query transaction
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        log_query(
            self.db_path,
            user_id=user_id,
            query=question,
            response=parsed_result["answer"],
            retrieved_info=[
                {
                    "chunk_index": c["chunk_index"],
                    "page_number": c["page_number"],
                    "document_name": c["document_name"],
                    "similarity": c["similarity"]
                }
                for c in retrieved_chunks
            ],
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens
        )
        
        return parsed_result
