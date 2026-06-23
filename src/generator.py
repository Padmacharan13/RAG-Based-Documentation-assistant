import os
import re
from typing import List, Dict, Any
from groq import Groq
from dotenv import load_dotenv

# Load environmental variables from .env if present
load_dotenv()

class GroqGenerator:
    """
    Handles LLM generation using Groq's API and provides utility
    to parse and format citation tags.
    """
    def __init__(self, model_name: str = "llama-3.3-70b-versatile", api_key: str = None):
        self.model_name = model_name
        self.api_key = api_key or os.environ.get("GROQ_API_KEY")
        
        if not self.api_key:
            raise ValueError(
                "Groq API key not found. Please supply it via the api_key parameter "
                "or set the GROQ_API_KEY environment variable."
            )
            
        base_url = os.environ.get("GROQ_BASE_URL")
        if base_url:
            self.client = Groq(api_key=self.api_key, base_url=base_url)
        else:
            self.client = Groq(api_key=self.api_key)

    def generate_response(self, question: str, retrieved_chunks: List[Dict[str, Any]]) -> str:
        """
        Formats prompt templates, calls Groq API, and returns the raw response text.
        """
        # Format the context chunks with 1-based indexing for the LLM
        formatted_context = ""
        for i, chunk in enumerate(retrieved_chunks):
            # i+1 is the source index used for citations, e.g. [Source 1]
            formatted_context += f"--- Chunk {i+1} (Page {chunk['page_number']}) ---\n"
            formatted_context += f"{chunk['text']}\n\n"
            
        system_prompt = (
            "You are a precise, truth-focused document QA assistant. Your job is to answer the user's question "
            "using ONLY the provided text chunks.\n\n"
            "Rules:\n"
            "1. Rely ONLY on the provided chunks. Do NOT make up facts or use external knowledge.\n"
            "2. If the provided chunks do not contain enough information to answer the question, you MUST "
            "respond with exactly this string: "
            "\"I'm sorry, but the provided document does not contain enough information to answer your question.\"\n"
            "3. For every factual claim, sentence, or point in your answer, you MUST cite the source chunk index "
            "by appending '[Source N]' at the end, where N is the 1-based index of that chunk. "
            "For example: 'RAG is an architectural pattern [Source 1]. It reduces hallucinations [Source 2].'\n"
            "4. If a statement combines info from multiple chunks, append all corresponding citations, e.g., '[Source 1][Source 3]'.\n"
            "5. Do NOT include any citations that are not present in the provided chunks."
        )
        
        user_prompt = f"Context chunks:\n{formatted_context}\nQuestion: {question}\n\nAnswer:"
        
        # Call Groq API
        chat_completion = self.client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=self.model_name,
            temperature=0.0,  # Zero temperature for factual/deterministic responses
        )
        
        return chat_completion.choices[0].message.content.strip()

    def parse_citations(self, response_text: str, retrieved_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Parses [Source N] tags in the response text, resolves N to page numbers from the chunks database,
        and constructs a structured dictionary suitable for UI consumption.
        
        Returns:
            A dict with:
                - 'answer': Raw LLM response string
                - 'clean_answer': Text with citation tags formatted (e.g. replacing [Source N] with [Page X])
                - 'citations': List of unique page numbers cited (integers, sorted)
                - 'segments': List of dicts representing structured text/citation blocks
        """
        fallback_msg = "I'm sorry, but the provided document does not contain enough information to answer your question."
        if response_text.strip() == fallback_msg:
            return {
                "answer": fallback_msg,
                "clean_answer": fallback_msg,
                "citations": [],
                "segments": [{"type": "text", "content": fallback_msg}]
            }
            
        # Pattern to match [Source N] or [Source: N] or [source N]
        pattern = r"\[[sS]ource\s+(\d+)\]"
        
        segments = []
        citations_set = set()
        last_idx = 0
        
        # Find all matches
        for match in re.finditer(pattern, response_text):
            start, end = match.span()
            chunk_num = int(match.group(1))
            
            # Add preceding text segment if any
            if start > last_idx:
                segments.append({
                    "type": "text",
                    "content": response_text[last_idx:start]
                })
                
            # Resolve chunk_num to metadata
            # Match is 1-based, so chunk index is chunk_num - 1
            if 1 <= chunk_num <= len(retrieved_chunks):
                chunk = retrieved_chunks[chunk_num - 1]
                page_number = chunk.get("page_number", 0)
                citations_set.add(page_number)
                
                segments.append({
                    "type": "citation",
                    "chunk_index": chunk_num,
                    "page": page_number,
                    "text": match.group(0)  # [Source N]
                })
            else:
                # If LLM hallucinates an out-of-bounds source number, treat it as text
                segments.append({
                    "type": "text",
                    "content": match.group(0)
                })
                
            last_idx = end
            
        # Add remaining text segment if any
        if last_idx < len(response_text):
            segments.append({
                "type": "text",
                "content": response_text[last_idx:]
            })
            
        # Create clean answer (substitute [Source N] with [Page X])
        def replace_source(match):
            chunk_num = int(match.group(1))
            if 1 <= chunk_num <= len(retrieved_chunks):
                page_number = retrieved_chunks[chunk_num - 1].get("page_number", 0)
                return f"[Page {page_number}]"
            return match.group(0)
            
        clean_answer = re.sub(pattern, replace_source, response_text)
        
        return {
            "answer": response_text,
            "clean_answer": clean_answer,
            "citations": sorted(list(citations_set)),
            "segments": segments
        }
