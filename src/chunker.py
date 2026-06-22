from typing import List, Dict, Any
from transformers import AutoTokenizer

class TokenChunker:
    """
            Chunks text page-by-page using the tokenizer of the target embedding model.
    This ensures chunks are measured in actual tokens and fits within the model's structure.
    """
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2", chunk_size: int = 400, overlap: int = 50):
        if overlap >= chunk_size:
            raise ValueError(f"Overlap ({overlap}) must be smaller than chunk_size ({chunk_size}).")
        
        self.chunk_size = chunk_size
        self.overlap = overlap
        # Load the tokenizer associated with the sentence-transformer model
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)

    def chunk_page(self, page_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Splits a single page's text into token-based chunks with overlap.
        
        Args:
            page_data: Dict containing 'page_number' (int) and 'text' (str).
            
        Returns:
            A list of chunk dicts, each containing:
                - 'text': str (chunk text)
                - 'page_number': int (original page number)
                - 'token_count': int (number of tokens in this chunk)
        """
        text = page_data["text"]
        page_number = page_data["page_number"]
        
        if not text.strip():
            return []
            
        # Encode text to token IDs without adding special tokens (like [CLS], [SEP])
        # so we get pure text tokens
        token_ids = self.tokenizer.encode(text, add_special_tokens=False)
        total_tokens = len(token_ids)
        
        # If the page text has fewer tokens than the chunk_size, return it as a single chunk
        if total_tokens <= self.chunk_size:
            return [{
                "text": text,
                "page_number": page_number,
                "token_count": total_tokens
            }]
            
        chunks = []
        start = 0
        step = self.chunk_size - self.overlap
        
        while start < total_tokens:
            end = min(start + self.chunk_size, total_tokens)
            chunk_token_ids = token_ids[start:end]
            
            # Decode back to text
            chunk_text = self.tokenizer.decode(chunk_token_ids, clean_up_tokenization_spaces=True)
            
            chunks.append({
                "text": chunk_text.strip(),
                "page_number": page_number,
                "token_count": len(chunk_token_ids)
            })
            
            # If we reached the end of the text, stop
            if end == total_tokens:
                break
                
            start += step
            
        return chunks

    def chunk_all_pages(self, pages_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Chunks a list of page data dicts.
        
        Args:
            pages_data: List of dicts from PDFExtractor.extract_pages().
            
        Returns:
            A list of all chunks from all pages.
        """
        all_chunks = []
        for page_data in pages_data:
            chunks = self.chunk_page(page_data)
            all_chunks.extend(chunks)
        return all_chunks
