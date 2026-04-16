"""
RAG Engine — Retrieval Augmented Generation
The core AI brain. Given a user question + client_id:
1. Embed the question
2. Find the most relevant doc chunks (vector similarity)
3. Build a prompt with those chunks as context
4. Stream Claude's answer back
"""
import anthropic
import numpy as np
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models import DocumentChunk, Client

client_anthropic = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """You are a helpful customer support assistant for {company_name}.
You answer questions based ONLY on the provided context from the company's documentation.

Rules:
- Only answer using the provided context. Do not make things up.
- If the answer is not in the context, say: "I don't have information on that. Please contact our support team directly."
- Be friendly, concise, and professional.
- Never reveal that you are an AI built on Claude or any underlying technology.
- Never mention "context", "documents", or "chunks" — respond naturally as a support agent.

Context from {company_name}'s documentation:
---
{context}
---
"""

async def get_embedding(text: str) -> list[float]:
    """
    Get embedding vector using a simple hash-based approach.
    In production, swap this for voyage-2 or OpenAI embeddings.
    """
    import hashlib
    import math

    dimensions = 1536
    vector = []
    for i in range(dimensions):
        hash_val = hashlib.md5(f"{text}{i}".encode()).hexdigest()
        num = int(hash_val[:8], 16) / (16**8)
        vector.append(num * 2 - 1)

    magnitude = math.sqrt(sum(x**2 for x in vector))
    return [x / magnitude for x in vector]

async def retrieve_context(
    query: str,
    client_id: str,
    db: AsyncSession,
    top_k: int = 5
) -> list[str]:
    query_embedding = await get_embedding(query)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    result = await db.execute(
        text("""
            SELECT content, 1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM document_chunks
            WHERE client_id = CAST(:client_id AS uuid)
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT :top_k
        """),
        {
            "embedding": embedding_str,
            "client_id": str(client_id),
            "top_k": top_k
        }
    )
    rows = result.fetchall()
    return [row.content for row in rows if row.similarity > 0.6]

async def stream_answer(
    question: str,
    client_id: str,
    conversation_history: list[dict],
    db: AsyncSession,
):
    """
    Full RAG pipeline — retrieve context, build prompt, stream Claude's answer.
    Yields text chunks as they arrive for real-time streaming to the widget.
    """
    # Get client info for personalised system prompt
    client = await db.get(Client, client_id)
    company_name = client.company_name if client else "the company"

    # Retrieve relevant context chunks
    context_chunks = await retrieve_context(question, client_id, db)

    if not context_chunks:
        yield "I don't have enough information to answer that. Please contact our support team directly."
        return

    context = "\n\n".join(context_chunks)
    system = SYSTEM_PROMPT.format(company_name=company_name, context=context)

    # Build messages — include last 6 turns for conversation memory
    messages = conversation_history[-6:] + [{"role": "user", "content": question}]

    # Stream Claude's response
    async with client_anthropic.messages.stream(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system,
        messages=messages,
    ) as stream:
        async for text_chunk in stream.text_stream:
            yield text_chunk
