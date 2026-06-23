import os
import shutil
import time
import unittest
from fastapi.testclient import TestClient

# Create unique test directories and override database path in app before imports
os.environ["RATE_LIMIT_PER_HOUR"] = "3"  # Set to a low value for testing rate limiting
import app
app.DB_PATH = "test_rag_database.db"
app.VECTOR_DB_DIR = "test_vector_store_db"
app.UPLOADS_DIR = "test_uploads"

from app import app as fastapi_app
from src.generator import GroqGenerator
from test_rag_pipeline import create_dummy_pdf

# Smart mock generator for Groq API calls to test retrieval accuracy and content isolation
def smart_mock_generate_response(self, question: str, retrieved_chunks: list):
    context = " ".join([c["text"] for c in retrieved_chunks]).lower()
    print(f"  -> [Smart Mock LLM] Question: '{question}' | Context matched: '{context[:80]}...'")
    
    if "magic word" in question.lower() and "banana" in context:
        return "The magic word is BANANA [Source 1].", 45, 12
    elif "secret code" in question.lower() and "chocolate" in context:
        return "The secret code is CHOCOLATE [Source 1].", 50, 15
    else:
        return "I'm sorry, but the provided document does not contain enough information to answer your question.", 35, 10

# Apply the mock to the GroqGenerator
GroqGenerator.generate_response = smart_mock_generate_response

# Helper to generate custom text dummy PDF
def create_custom_dummy_pdf(pdf_path: str, heading: str, body: str):
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    
    doc = SimpleDocTemplate(pdf_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(heading, styles['Heading1']),
        Spacer(1, 12),
        Paragraph(body, styles['BodyText'])
    ]
    doc.build(story)

class TestProductFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Ensure clean environment for tests
        cls.cleanup_test_data()
        
        # Initialize test databases
        with TestClient(fastapi_app) as client:
            # Running the client context triggers the FastAPI startup event
            pass
        
        cls.client = TestClient(fastapi_app)

    @classmethod
    def tearDownClass(cls):
        cls.cleanup_test_data()

    @classmethod
    def cleanup_test_data(cls):
        # Remove SQLite database
        if os.path.exists(app.DB_PATH):
            try:
                os.remove(app.DB_PATH)
            except Exception as e:
                print(f"Could not remove database file: {e}")
                
        # Remove FAISS indexes
        if os.path.exists(app.VECTOR_DB_DIR):
            shutil.rmtree(app.VECTOR_DB_DIR, ignore_errors=True)
            
        # Remove Uploads dir
        if os.path.exists(app.UPLOADS_DIR):
            shutil.rmtree(app.UPLOADS_DIR, ignore_errors=True)
            
        # Remove test temp pdfs
        for f in ["alice_doc.pdf", "bob_doc.pdf"]:
            if os.path.exists(f):
                os.remove(f)

    def test_end_to_end_flow(self):
        print("\n=== STARTING END-TO-END PRODUCT FLOW INTEGRATION TESTS ===\n")

        # 1. TEST USER REGISTRATION
        print("--- Testing User Registration ---")
        # Register User A (Alice)
        resp = self.client.post("/register", json={"username": "alice", "password": "alicepassword"})
        self.assertEqual(resp.status_code, 201)
        alice_user_id = resp.json()["user_id"]
        print(f"  Alice registered with ID: {alice_user_id}")
        
        # Register User B (Bob)
        resp = self.client.post("/register", json={"username": "bob", "password": "bobpassword"})
        self.assertEqual(resp.status_code, 201)
        bob_user_id = resp.json()["user_id"]
        print(f"  Bob registered with ID: {bob_user_id}")
        
        # Attempt registering duplicate username
        resp = self.client.post("/register", json={"username": "alice", "password": "differentpassword"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Username already registered", resp.json()["detail"])
        print("  Duplicate registration blocked correctly.")

        # 2. TEST LOGIN & JWT TOKEN ISSUANCE
        print("\n--- Testing Login & JWT Authentication ---")
        # Valid login Alice
        resp = self.client.post("/login", json={"username": "alice", "password": "alicepassword"})
        self.assertEqual(resp.status_code, 200)
        alice_token = resp.json()["access_token"]
        self.assertEqual(resp.json()["token_type"], "bearer")
        print("  Alice logged in successfully and received JWT.")
        
        # Valid login Bob
        resp = self.client.post("/login", json={"username": "bob", "password": "bobpassword"})
        self.assertEqual(resp.status_code, 200)
        bob_token = resp.json()["access_token"]
        print("  Bob logged in successfully and received JWT.")

        # Invalid login
        resp = self.client.post("/login", json={"username": "alice", "password": "wrongpassword"})
        self.assertEqual(resp.status_code, 401)
        print("  Invalid password credentials rejected correctly.")

        # 3. TEST AUTHENTICATION SECURED ENDPOINTS
        print("\n--- Testing Protected Endpoints (Access Control) ---")
        resp = self.client.post("/ask", json={"question": "hello"})
        self.assertEqual(resp.status_code, 401)
        print("  Anonymous query to /ask blocked.")
        
        resp = self.client.get("/query_logs")
        self.assertEqual(resp.status_code, 401)
        print("  Anonymous query to /query_logs blocked.")

        # 4. TEST BACKGROUND INGESTION & DOCUMENT PRIVACY
        print("\n--- Testing Document Upload & Private Vector Partitioning ---")
        # Create Alice's private document
        create_custom_dummy_pdf(
            "alice_doc.pdf", 
            "Alice's Top Secret Document", 
            "The magic word is BANANA. Do not share this information with anyone else."
        )
        # Create Bob's private document
        create_custom_dummy_pdf(
            "bob_doc.pdf", 
            "Bob's Personal Journal", 
            "The secret code is CHOCOLATE. Keep this entry highly classified."
        )

        headers_alice = {"Authorization": f"Bearer {alice_token}"}
        headers_bob = {"Authorization": f"Bearer {bob_token}"}

        # Alice uploads her document
        print("  Alice uploading private document...")
        with open("alice_doc.pdf", "rb") as f:
            resp = self.client.post("/upload", files={"file": ("alice_doc.pdf", f, "application/pdf")}, headers=headers_alice)
        self.assertEqual(resp.status_code, 202)
        alice_doc_id = resp.json()["document_id"]
        self.assertEqual(resp.json()["status"], "PENDING")
        print(f"  Upload accepted. Alice Document ID: {alice_doc_id}")

        # Bob uploads his document
        print("  Bob uploading private document...")
        with open("bob_doc.pdf", "rb") as f:
            resp = self.client.post("/upload", files={"file": ("bob_doc.pdf", f, "application/pdf")}, headers=headers_bob)
        self.assertEqual(resp.status_code, 202)
        bob_doc_id = resp.json()["document_id"]
        print(f"  Upload accepted. Bob Document ID: {bob_doc_id}")

        # Poll status of Alice's document to verify background task completes
        print("  Waiting for Alice's background document ingestion...")
        for _ in range(20):
            resp = self.client.get(f"/documents/{alice_doc_id}", headers=headers_alice)
            self.assertEqual(resp.status_code, 200)
            status = resp.json()["status"]
            if status == "COMPLETED":
                break
            elif status == "FAILED":
                self.fail(f"Alice's background ingestion failed: {resp.json()['error_message']}")
            time.sleep(0.5)
        self.assertEqual(status, "COMPLETED")
        print("  Alice's background ingestion completed successfully.")

        # Poll status of Bob's document
        print("  Waiting for Bob's background document ingestion...")
        for _ in range(20):
            resp = self.client.get(f"/documents/{bob_doc_id}", headers=headers_bob)
            self.assertEqual(resp.status_code, 200)
            status = resp.json()["status"]
            if status == "COMPLETED":
                break
            elif status == "FAILED":
                self.fail(f"Bob's background ingestion failed: {resp.json()['error_message']}")
            time.sleep(0.5)
        self.assertEqual(status, "COMPLETED")
        print("  Bob's background ingestion completed successfully.")

        # Test document access control (Bob cannot view status of Alice's document)
        resp = self.client.get(f"/documents/{alice_doc_id}", headers=headers_bob)
        self.assertEqual(resp.status_code, 404)
        print("  Cross-user document status access blocked correctly.")

        # 5. TEST PRIVACY & DOCUMENT ISOLATION IN SEARCH
        print("\n--- Testing Search & Privacy Isolation ---")
        # Alice queries her own document
        print("  Alice querying her own data...")
        resp = self.client.post(
            "/ask", 
            json={"question": "What is the magic word?", "similarity_threshold": 0.20}, 
            headers=headers_alice
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["short_circuited"])
        self.assertIn("BANANA", resp.json()["clean_answer"])
        print("  Alice retrieved her private data successfully.")

        # Alice queries Bob's data (Should short-circuit or fallback, NOT return chocolate)
        print("  Alice attempting to query Bob's data...")
        resp = self.client.post(
            "/ask", 
            json={"question": "What is the secret code?", "similarity_threshold": 0.20}, 
            headers=headers_alice
        )
        self.assertEqual(resp.status_code, 200)
        # Verify it either short circuited or returned fallback answer without mentioning CHOCOLATE
        self.assertNotIn("CHOCOLATE", resp.json()["clean_answer"])
        print("  Privacy confirmed: Alice failed to access Bob's data.")

        # Bob queries his own document
        print("  Bob querying his own data...")
        resp = self.client.post(
            "/ask", 
            json={"question": "What is the secret code?", "similarity_threshold": 0.20}, 
            headers=headers_bob
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["short_circuited"])
        self.assertIn("CHOCOLATE", resp.json()["clean_answer"])
        print("  Bob retrieved his private data successfully.")

        # Bob queries Alice's data
        print("  Bob attempting to query Alice's data...")
        resp = self.client.post(
            "/ask", 
            json={"question": "What is the magic word?", "similarity_threshold": 0.20}, 
            headers=headers_bob
        )
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("BANANA", resp.json()["clean_answer"])
        print("  Privacy confirmed: Bob failed to access Alice's data.")

        # 6. TEST RATE LIMITING
        # Currently rate limit is set to 3 queries per hour in env.
        # Alice already made 2 queries ("What is the magic word?", "What is the secret code?")
        print("\n--- Testing Hourly Rate Limiter (Limit = 3 queries/hour) ---")
        # Query 3
        resp = self.client.post(
            "/ask", 
            json={"question": "Query 3: Who are you?", "similarity_threshold": 0.20}, 
            headers=headers_alice
        )
        self.assertEqual(resp.status_code, 200)
        print("  Query 3 executed successfully.")

        # Query 4 (Should be rate limited)
        resp = self.client.post(
            "/ask", 
            json={"question": "Query 4: Limit checker", "similarity_threshold": 0.20}, 
            headers=headers_alice
        )
        self.assertEqual(resp.status_code, 429)
        self.assertIn("queries per hour exceeded", resp.json()["detail"])
        print("  Query 4 blocked by rate limiter successfully (HTTP 429).")

        # Verify rate limit is user-scoped (Bob can still query!)
        resp = self.client.post(
            "/ask", 
            json={"question": "Bob query check", "similarity_threshold": 0.20}, 
            headers=headers_bob
        )
        self.assertEqual(resp.status_code, 200)
        print("  Rate limits are user-scoped: Bob query succeeded while Alice is limited.")

        # 7. TEST DETAILED USAGE LOGS AND PRIVACY
        print("\n--- Testing Audit Logging & Privacy ---")
        # Alice fetches logs
        resp = self.client.get("/query_logs", headers=headers_alice)
        self.assertEqual(resp.status_code, 200)
        alice_logs = resp.json()["logs"]
        
        # Verify Alice's logs
        self.assertTrue(len(alice_logs) >= 3)
        for log in alice_logs:
            # Latency tracking verified
            self.assertGreater(log["latency_ms"], 0)
            # Token usage tracked
            self.assertIn("prompt_tokens", log)
            self.assertIn("completion_tokens", log)
            # Checked queries are Alice's
            self.assertNotIn("Bob query check", log["query"])
            
        print(f"  Alice's logs checked: Found {len(alice_logs)} logs with latency and token usage.")

        # Bob fetches logs
        resp = self.client.get("/query_logs", headers=headers_bob)
        self.assertEqual(resp.status_code, 200)
        bob_logs = resp.json()["logs"]
        
        self.assertTrue(len(bob_logs) >= 3)
        for log in bob_logs:
            self.assertNotIn("Query 3: Who are you?", log["query"])
            
        print(f"  Bob's logs checked: Found {len(bob_logs)} logs with no cross-user log leakage.")

        
        print("\n=== ALL E2E PRODUCT FLOW INTEGRATION TESTS COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    unittest.main()
