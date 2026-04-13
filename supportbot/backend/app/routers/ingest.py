from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, HttpUrl
from app.database import get_db
from app.models import Document, Client
from app.auth import require_active_subscription
from app.ingestion import (
    extract_text_from_pdf,
    extract_text_from_url,
    ingest_document,
)
import uuid

router = APIRouter()

class UrlIngestRequest(BaseModel):
    url: HttpUrl
    name: str

class DocumentResponse(BaseModel):
    id: str
    name: str
    status: str
    chunk_count: int

@router.post("/upload", response_model=DocumentResponse)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    client: Client = Depends(require_active_subscription),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_bytes = await file.read()
    text = await extract_text_from_pdf(file_bytes)

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    doc = Document(
        id=uuid.uuid4(),
        client_id=client.id,
        name=file.filename,
        source="upload",
        status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(ingest_document, str(doc.id), str(client.id), text)
    return DocumentResponse(id=str(doc.id), name=doc.name, status=doc.status, chunk_count=0)

@router.post("/url", response_model=DocumentResponse)
async def ingest_url(
    req: UrlIngestRequest,
    background_tasks: BackgroundTasks,
    client: Client = Depends(require_active_subscription),
    db: AsyncSession = Depends(get_db),
):
    text = await extract_text_from_url(str(req.url))
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from URL")

    doc = Document(
        id=uuid.uuid4(),
        client_id=client.id,
        name=req.name,
        source="url",
        source_url=str(req.url),
        status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    background_tasks.add_task(ingest_document, str(doc.id), str(client.id), text)
    return DocumentResponse(id=str(doc.id), name=doc.name, status=doc.status, chunk_count=0)

@router.get("/documents")
async def list_documents(
    client: Client = Depends(require_active_subscription),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.client_id == client.id)
    )
    docs = result.scalars().all()
    return [
        DocumentResponse(id=str(d.id), name=d.name, status=d.status, chunk_count=d.chunk_count)
        for d in docs
    ]

@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    client: Client = Depends(require_active_subscription),
    db: AsyncSession = Depends(get_db),
):
    doc = await db.get(Document, document_id)
    if not doc or str(doc.client_id) != str(client.id):
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    await db.commit()
    return {"deleted": True}
