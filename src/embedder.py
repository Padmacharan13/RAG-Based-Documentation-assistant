import os
from dotenv import load_dotenv

# Load environment variables (useful for standalone scripts/tests)
load_dotenv()

# Suppress Hugging Face Hub warning if token is not set
if not os.environ.get("HF_TOKEN"):
    os.environ["HF_HUB_VERBOSITY"] = "error"

from typing import List
import numpy as np
from sentence_transformers import SentenceTransformer


class DocumentEmbedder:
    """
    Handles generating dense vector embeddings for text chunks
    using the sentence-transformers library.
    """
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", normalize: bool = True):
        # This will load the model (downloading it on first run)
        self.model = SentenceTransformer(model_name)
        self.embedding_dimension = self.model.get_embedding_dimension()
        self.normalize = normalize

    def embed_chunks(self, chunks: List[str]) -> np.ndarray:
        """
        Embeds a list of text chunks.
        
        Args:
            chunks: A list of text strings.
            
        Returns:
            A numpy array of shape (num_chunks, embedding_dimension) of type float32.
        """
        if not chunks:
            return np.empty((0, self.embedding_dimension), dtype=np.float32)
            
        # Encode returns a numpy array by default
        embeddings = self.model.encode(
            chunks, 
            show_progress_bar=False, 
            convert_to_numpy=True,
            normalize_embeddings=self.normalize
        )
        return embeddings.astype(np.float32)

    def embed_query(self, query: str) -> np.ndarray:
        """
        Embeds a single query string.
        
        Args:
            query: The query text.
            
        Returns:
            A 1D numpy array of shape (embedding_dimension,) of type float32.
        """
        embedding = self.model.encode(
            query, 
            show_progress_bar=False, 
            convert_to_numpy=True,
            normalize_embeddings=self.normalize
        )
        return embedding.astype(np.float32)
