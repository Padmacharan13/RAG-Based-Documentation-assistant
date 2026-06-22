import os
import json
import pickle
import numpy as np
import faiss
from typing import List, Dict, Any, Tuple

class FAISSVectorStore:
    """
    A lightweight, pure-Python wrapper around FAISS to store vector embeddings
    and associate them with their respective document chunk metadata (text & page number).
    """
    def __init__(self, dimension: int = 384):
        self.dimension = dimension
        # Flat L2 index performs exhaustive exact search using Euclidean distance.
        # Smaller L2 distance indicates higher similarity.
        self.index = faiss.IndexFlatL2(self.dimension)
        # Holds metadata dictionaries matching the order of vectors in the index
        self.metadata: List[Dict[str, Any]] = []

    def add_documents(self, embeddings: np.ndarray, chunks_metadata: List[Dict[str, Any]]):
        """
        Adds multiple document embeddings and their corresponding metadata to the store.
        
        Args:
            embeddings: Numpy array of shape (num_chunks, dimension).
            chunks_metadata: List of dicts, each holding 'text', 'page_number', etc.
        """
        if len(embeddings) == 0:
            return
            
        assert len(embeddings) == len(chunks_metadata), (
            f"Embeddings count ({len(embeddings)}) must match metadata count ({len(chunks_metadata)})"
        )
        assert embeddings.shape[1] == self.dimension, (
            f"Embedding dimension ({embeddings.shape[1]}) must match index dimension ({self.dimension})"
        )
        
        # Ensure correct type for FAISS
        embeddings_f32 = embeddings.astype(np.float32)
        
        # Add to FAISS index
        self.index.add(embeddings_f32)
        
        # Store metadata
        self.metadata.extend(chunks_metadata)

    def similarity_search(self, query_embedding: np.ndarray, k: int = 3) -> List[Tuple[Dict[str, Any], float]]:
        """
        Performs similarity search against the stored vectors.
        
        Args:
            query_embedding: Numpy array of shape (dimension,) or (1, dimension).
            k: Number of nearest neighbors to retrieve.
            
        Returns:
            A list of tuples: (metadata_dict, distance_score)
            Ordered by increasing distance (closest first).
        """
        # Reshape to 2D array if 1D
        if len(query_embedding.shape) == 1:
            query_embedding = np.expand_dims(query_embedding, axis=0)
            
        query_f32 = query_embedding.astype(np.float32)
        
        # FAISS index.search returns (distances, indices)
        # distances is shape (1, k), indices is shape (1, k)
        distances, indices = self.index.search(query_f32, k)
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            # FAISS returns -1 index if not enough documents are present in the index
            if idx != -1 and idx < len(self.metadata):
                results.append((self.metadata[idx], float(dist)))
                
        return results

    def save(self, directory_path: str):
        """
        Saves the FAISS index and corresponding metadata to a specified directory.
        """
        os.makedirs(directory_path, exist_ok=True)
        
        index_file = os.path.join(directory_path, "index.faiss")
        metadata_file = os.path.join(directory_path, "metadata.json")
        
        # Save FAISS index
        faiss.write_index(self.index, index_file)
        
        # Save metadata as JSON (cleaner and more portable than pickle)
        with open(metadata_file, "w", encoding="utf-8") as f:
            json.dump(self.metadata, f, ensure_ascii=False, indent=2)

    def load(self, directory_path: str):
        """
        Loads the FAISS index and corresponding metadata from a specified directory.
        """
        index_file = os.path.join(directory_path, "index.faiss")
        metadata_file = os.path.join(directory_path, "metadata.json")
        
        if not os.path.exists(index_file) or not os.path.exists(metadata_file):
            raise FileNotFoundError(
                f"Could not find index or metadata files in directory: '{directory_path}'"
            )
            
        # Load FAISS index
        self.index = faiss.read_index(index_file)
        self.dimension = self.index.d
        
        # Load metadata
        with open(metadata_file, "r", encoding="utf-8") as f:
            self.metadata = json.load(f)
            
        # Verify sizes match
        assert self.index.ntotal == len(self.metadata), (
            f"FAISS index total vectors ({self.index.ntotal}) does not match metadata length ({len(self.metadata)})"
        )
