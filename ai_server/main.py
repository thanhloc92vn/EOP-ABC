import os
import math
import json
import sqlite3
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI

# 1. LOAD CONFIGURATION FROM NEXT.JS .ENV.LOCAL
BASE_DIR = Path(__file__).parent.parent
env_path = BASE_DIR / "dashboard" / ".env.local"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
# Fallback to NEXT_PUBLIC if defined
if not OPENAI_API_KEY:
    OPENAI_API_KEY = os.getenv("NEXT_PUBLIC_OPENAI_API_KEY")

# Initialize FastAPI app
app = FastAPI(title="Trung Nam E&C AI Parallel Server", version="1.0.0")

# Initialize OpenAI client
openai_client = None
if OPENAI_API_KEY:
    openai_client = OpenAI(api_key=OPENAI_API_KEY)

# 2. SQLITE DATABASE SETUP FOR VECTOR STORAGE
DB_PATH = BASE_DIR / "ai_server" / "embeddings.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

# Create tables if not exist
with get_db() as conn:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id TEXT PRIMARY KEY,
            file_path TEXT,
            file_name TEXT,
            chunk_index INTEGER,
            content TEXT,
            embedding TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

# 3. HELPER FUNCTIONS FOR VECTOR MATH & TEXT CHUNKING
def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot_product = sum(x * y for x, y in zip(v1, v2))
    magnitude1 = math.sqrt(sum(x * x for x in v1))
    magnitude2 = math.sqrt(sum(x * x for x in v2))
    if not magnitude1 or not magnitude2:
        return 0.0
    return dot_product / (magnitude1 * magnitude2)

def chunk_text(text: str, chunk_size: int = 600, overlap: int = 150) -> List[str]:
    chunks = []
    if not text:
        return chunks
    words = text.split()
    current_chunk = []
    current_size = 0
    
    for word in words:
        current_chunk.append(word)
        current_size += len(word) + 1 # +1 for space
        if current_size >= chunk_size:
            chunks.append(" ".join(current_chunk))
            # Keep overlap
            overlap_words = current_chunk[-max(1, len(current_chunk) // 4):]
            current_chunk = list(overlap_words)
            current_size = sum(len(w) + 1 for w in current_chunk)
            
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks

def get_embedding(text: str) -> List[float]:
    global openai_client
    if not openai_client:
        # Try to reload key in case it was updated in Settings
        load_dotenv(dotenv_path=env_path, override=True)
        key = os.getenv("OPENAI_API_KEY") or os.getenv("NEXT_PUBLIC_OPENAI_API_KEY")
        if key:
            openai_client = OpenAI(api_key=key)
            
    if not openai_client:
        raise HTTPException(status_code=500, detail="OpenAI API Key not configured in system settings!")
        
    try:
        response = openai_client.embeddings.create(
            input=text.replace("\n", " "),
            model="text-embedding-3-small"
        )
        return response.data[0].embedding
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate embedding: {str(e)}")

# 4. API SCHEMAS & ENDPOINTS
class DocumentInput(BaseModel):
    file_path: str
    file_name: str
    content: str

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "database_connected": DB_PATH.exists(),
        "openai_key_configured": bool(OPENAI_API_KEY or os.getenv("OPENAI_API_KEY"))
    }

@app.post("/index_document")
def index_document(doc: DocumentInput):
    chunks = chunk_text(doc.content)
    if not chunks:
        return {"message": "Empty document, nothing indexed."}
        
    with get_db() as conn:
        # Delete old chunks for this file path
        conn.execute("DELETE FROM document_chunks WHERE file_path = ?", (doc.file_path,))
        
        for idx, chunk in enumerate(chunks):
            embedding = get_embedding(chunk)
            chunk_id = f"{doc.file_path}_{idx}"
            conn.execute(
                "INSERT INTO document_chunks (id, file_path, file_name, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?, ?)",
                (chunk_id, doc.file_path, doc.file_name, idx, chunk, json.dumps(embedding))
            )
        conn.commit()
        
    return {"message": f"Successfully indexed '{doc.file_name}' into {len(chunks)} chunks."}

@app.get("/search")
def search_documents(query: str = Query(..., min_length=2), limit: int = 5):
    query_vector = get_embedding(query)
    
    with get_db() as conn:
        cursor = conn.execute("SELECT file_path, file_name, content, embedding FROM document_chunks")
        rows = cursor.fetchall()
        
    results = []
    for row in rows:
        chunk_vector = json.loads(row["embedding"])
        sim = cosine_similarity(query_vector, chunk_vector)
        results.append({
            "file_path": row["file_path"],
            "file_name": row["file_name"],
            "content": row["content"],
            "similarity": sim
        })
        
    # Sort by similarity descending
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:limit]

@app.post("/clear_index")
def clear_index():
    with get_db() as conn:
        conn.execute("DELETE FROM document_chunks")
        conn.commit()
    return {"message": "Successfully cleared vector index database."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8500, reload=True)
