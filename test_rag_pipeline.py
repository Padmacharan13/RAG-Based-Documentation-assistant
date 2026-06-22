import os
import shutil
from src.extractor import PDFExtractor
from src.chunker import TokenChunker
from src.embedder import DocumentEmbedder
from src.vector_store import FAISSVectorStore

# Helper to programmatically create a dummy PDF using reportlab
def create_dummy_pdf(pdf_path: str):
    """
    Generates a 3-page dummy PDF document for test verification.
    """
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, PageBreak, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    
    print(f"Generating dummy PDF at: '{pdf_path}'...")
    doc = SimpleDocTemplate(pdf_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Page 1 content
    story.append(Paragraph("Artificial Intelligence Foundations", styles['Heading1']))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "Artificial Intelligence (AI) refers to the simulation of human intelligence in machines "
        "that are programmed to think like humans and mimic their actions. The term may also be "
        "applied to any machine that exhibits traits associated with a human mind such as "
        "learning and problem-solving. Machine learning is a subset of AI that focuses on building "
        "systems that learn from data to improve performance.",
        styles['BodyText']
    ))
    story.append(PageBreak())
    
    # Page 2 content
    story.append(Paragraph("Retrieval-Augmented Generation (RAG)", styles['Heading1']))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "Retrieval-Augmented Generation (RAG) is an architectural pattern that optimizes the output "
        "of a large language model. It does this by referencing an authoritative, external knowledge "
        "base outside of its original training data before generating a response. RAG helps mitigate "
        "hallucinations and ensures the LLM has access to up-to-date information without requiring retraining.",
        styles['BodyText']
    ))
    story.append(PageBreak())
    
    # Page 3 content
    story.append(Paragraph("Vector Databases and Similarity Search", styles['Heading1']))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "Vector databases index and store unstructured data as high-dimensional dense vectors. "
        "FAISS (Facebook AI Similarity Search) is an open-source library built specifically for "
        "efficient similarity search and clustering of dense vectors. FAISS provides standard L2 "
        "distance and inner product calculations, running highly optimized operations that can scale "
        "to billions of vectors on both CPUs and GPUs.",
        styles['BodyText']
    ))
    
    doc.build(story)
    print("Dummy PDF successfully created.\n")

def run_test_pipeline():
    # File and DB paths
    dummy_pdf_path = "test_document.pdf"
    vector_db_dir = "vector_store_db"
    
    # 1. Generate the dummy PDF if it doesn't exist
    create_dummy_pdf(dummy_pdf_path)
    
    print("--- STEP 1: Document Extraction ---")
    extractor = PDFExtractor(dummy_pdf_path)
    extracted_pages = extractor.extract_pages()
    for page in extracted_pages:
        print(f"Page {page['page_number']}: Extracted {page['char_count']} characters.")
    print(f"Total pages extracted: {len(extracted_pages)}\n")
    
    print("--- STEP 2: Text Chunking ---")
    # Using small chunk sizes and overlaps suitable for dummy text demo
    chunker = TokenChunker(
        model_name="sentence-transformers/all-MiniLM-L6-v2", 
        chunk_size=100, 
        overlap=15
    )
    chunks = chunker.chunk_all_pages(extracted_pages)
    for i, chunk in enumerate(chunks):
        print(f"Chunk {i+1} (Page {chunk['page_number']}, Tokens: {chunk['token_count']}): {repr(chunk['text'][:80])}...")
    print(f"Total chunks created: {len(chunks)}\n")
    
    print("--- STEP 3: Embedding ---")
    embedder = DocumentEmbedder(model_name="sentence-transformers/all-MiniLM-L6-v2")
    chunk_texts = [c["text"] for c in chunks]
    embeddings = embedder.embed_chunks(chunk_texts)
    print(f"Embeddings shape: {embeddings.shape} (Dimension matches expected {embedder.embedding_dimension})\n")
    
    print("--- STEP 4: Vector Storage ---")
    # Instantiate the FAISS Vector Store
    vector_store = FAISSVectorStore(dimension=embedder.embedding_dimension)
    # Add documents (embeddings and metadata)
    vector_store.add_documents(embeddings, chunks)
    # Save database to disk
    print(f"Saving vector database to directory '{vector_db_dir}'...")
    vector_store.save(vector_db_dir)
    print("Vector database saved.\n")
    
    print("--- STEP 5: Verification (Load DB & Search) ---")
    # Load the DB back to verify loading logic works
    loaded_store = FAISSVectorStore()
    loaded_store.load(vector_db_dir)
    print("Vector database loaded successfully from disk.")
    
    # Sample questions to verify retrieval and page citation
    test_queries = [
        "What is Retrieval-Augmented Generation?",
        "What library is used for similarity search of dense vectors?",
        "Explain machine learning as a subset of artificial intelligence."
    ]
    
    for query in test_queries:
        print(f"\nQuery: '{query}'")
        query_vector = embedder.embed_query(query)
        # Search for the top 1 match
        search_results = loaded_store.similarity_search(query_vector, k=1)
        
        if search_results:
            metadata, distance = search_results[0]
            print(f"-> Top Match (Distance Score: {distance:.4f}):")
            print(f"   [Source Page: {metadata['page_number']}]")
            print(f"   [Content]: \"{metadata['text']}\"")
        else:
            print("-> No matches found.")

if __name__ == "__main__":
    run_test_pipeline()
