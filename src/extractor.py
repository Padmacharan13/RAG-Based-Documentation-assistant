import os
from typing import List, Dict, Any
from pypdf import PdfReader

class PDFExtractor:
    """
    Extracts text page-by-page from a PDF document.
    Ensures that every piece of extracted text is mapped to its original 1-based page number.
    """
    def __init__(self, pdf_path: str):
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"The PDF file at path '{pdf_path}' does not exist.")
        self.pdf_path = pdf_path

    def extract_pages(self) -> List[Dict[str, Any]]:
        """
        Extracts text page-by-page.
        
        Returns:
            A list of dicts, each with:
                - 'page_number': int (1-based)
                - 'text': str (raw extracted text)
                - 'char_count': int
        """
        reader = PdfReader(self.pdf_path)
        pages_data = []
        
        for idx, page in enumerate(reader.pages):
            page_number = idx + 1
            # Extract text (returns empty string if page has no text or is an image scan)
            text = page.extract_text() or ""
            # Clean up trailing/leading whitespace and standardize line endings
            cleaned_text = text.strip()
            
            pages_data.append({
                "page_number": page_number,
                "text": cleaned_text,
                "char_count": len(cleaned_text)
            })
            
        return pages_data
