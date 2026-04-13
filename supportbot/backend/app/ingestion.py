"""
Ingestion Service
Handles taking raw content (PDF, URL, plain text) → chunking → embedding → storing.
This runs as a background task so the API responds immediately.
"""
import re
import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader
from io import BytesIO
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Document, DocumentChunk
from app.rag_engine import get_embedding
from app.database import AsyncSessionLocal
import uuid

CHUNK_SIZE    = 500   # characters per chunk
CHUNK_OVERLAP = 50    # overlap between chunks to preserve context

def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks."""
    text = re.sub(r'\s+', ' ', text).strip()
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks

async def extract_text_from_pdf(file_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(file_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)

async def extract_text_from_url(url: str) -> str:
    async with httpx.AsyncClient(timeout=15) as http:
        response = await http.get(url, follow_redirects=True)
        response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    # Remove nav, footer, scripts
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    return soup.get_text(separator="\n", strip=True)

async def ingest_document(
    document_id: str,
    client_id: str,
    content: str,
):
    """
    Background task: chunk → embed → store all chunks for a document.
    Called after the document record is created.
    """
    async with AsyncSessionLocal() as db:
        try:
            doc = await db.get(Document, document_id)
            doc.status = "processing"
            await db.commit()

            chunks = chunk_text(content)
            chunk_records = []

            for i, chunk in enumerate(chunks):
                embedding = await get_embedding(chunk)
                chunk_records.append(DocumentChunk(
                    id=uuid.uuid4(),
                    client_id=client_id,
                    document_id=document_id,
                    content=chunk,
                    embedding=embedding,
                    chunk_index=i,
                ))

            db.add_all(chunk_records)
            doc.status = "ready"
            doc.chunk_count = len(chunk_records)
            await db.commit()

        except Exception as e:
            doc = await db.get(Document, document_id)
            if doc:
                doc.status = "failed"
                await db.commit()
            raise e
