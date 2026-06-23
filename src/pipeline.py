import numpy as np
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
        question: str,
        k: int = 4,
        similarity_threshold: float = 0.35
    ) -> Dict[str, Any]:
        """
        Executes the full RAG pipeline for a given user question.
        
        Args:
            question: The user query string.
            k: The number of top documents to retrieve.
            similarity_threshold: Cosine similarity cutoff value.
            
        Returns:
            A dictionary containing answer, clean_answer, citations, and segments.
        """
        # 1. Embed query (the embedder should return an L2-normalized vector)
        query_vector = self.embedder.embed_query(question)
        
        # Reshape for FAISS search if necessary
        if len(query_vector.shape) == 1:
            query_f32 = np.expand_dims(query_vector, axis=0).astype(np.float32)
        else:
            query_f32 = query_vector.astype(np.float32)
            
        # 2. Search FAISS index
        # FAISS search returns (distances, indices)
        # distances is shape (1, k), indices is shape (1, k)
        distances, indices = self.vector_store.index.search(query_f32, k)
        
        raw_indices = indices[0].tolist()
        raw_distances = distances[0].tolist()
        
        # Filter valid indices and calculate Cosine Similarity
        # For L2-normalized vectors, cosine_similarity = 1.0 - (L2_distance^2 / 2.0)
        # Note: FAISS IndexFlatL2 returns squared Euclidean distance (d^2)
        valid_indices = []
        similarities = []
        
        for idx, dist in zip(raw_indices, raw_distances):
            if idx != -1:
                # Calculate Cosine Similarity
                similarity = 1.0 - (dist / 2.0)
                # Keep in [-1.0, 1.0] range due to float precision
                similarity = max(-1.0, min(1.0, similarity))
                
                valid_indices.append(idx)
                similarities.append(similarity)
                
        # 3. Apply relevance threshold
        # If no valid chunks found, or the top match does not meet the similarity threshold
        fallback_msg = "I'm sorry, but the provided document does not contain enough information to answer your question."
        
        if not similarities or similarities[0] < similarity_threshold:
            # Short-circuit immediately, bypass Groq LLM
            # Log the short-circuited query with empty response (or fallback message)
            log_query(
                self.db_path,
                query=question,
                response=fallback_msg,
                retrieved_info=[]
            )
            return {
                "answer": fallback_msg,
                "clean_answer": fallback_msg,
                "citations": [],
                "segments": [{"type": "text", "content": fallback_msg}],
                "short_circuited": True
            }
            
        # 4. Fetch chunk details (text + page numbers) from SQLite table
        db_chunks = fetch_chunks(self.db_path, valid_indices)
        
        # Merge similarity scores into chunk metadata
        retrieved_chunks = []
        for chunk, similarity in zip(db_chunks, similarities):
            chunk_copy = dict(chunk)
            chunk_copy["similarity"] = similarity
            retrieved_chunks.append(chunk_copy)
            
        # 5. LLM Generation via Groq
        try:
            raw_response = self.generator.generate_response(question, retrieved_chunks)
        except Exception as e:
            # Fallback in case of API failure
            raw_response = f"Error generating response: {str(e)}"
            
        # 6. Parse and resolve [Source N] citation tags
        parsed_result = self.generator.parse_citations(raw_response, retrieved_chunks)
        parsed_result["short_circuited"] = False
        
        # 7. Log query transaction
        log_query(
            self.db_path,
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
            ]
        )
        
        return parsed_result
