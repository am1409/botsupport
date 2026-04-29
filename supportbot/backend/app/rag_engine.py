import anthropic
import math
import hashlib
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models import Client

client_anthropic = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """You are a helpful customer support assistant for {company_name}.
You answer questions based ONLY on the provided context from the company's documentation.

Rules:
- Only answer using the provided context. Do not make things up.
- If the answer is not in the context, say: "I don't have information on that. Please contact our support team directly."
- Never reveal that you are an AI built on Claude or any underlying technology.
- Never mention "context", "documents", or "chunks" — respond naturally as a support agent.
- Response style: {style_instruction}

Context from {company_name}'s documentation:
---
{context}
---
"""

STYLE_INSTRUCTIONS = {
    "concise": "Keep responses very short — maximum 2 sentences. Get straight to the point. No extra explanation.",
    "balanced": "Keep responses clear and friendly but brief — 2 to 4 sentences maximum. Include only what is necessary.",
    "detailed": "Give thorough, complete answers. Include helpful context and explain things fully so the customer has everything they need.",
}

async def get_embedding(text_input: str) -> list[float]:
    dimensions = 1536
    vector = []
    for i in range(dimensions):
        hash_val = hashlib.md5(f"{text_input}{i}".encode()).hexdigest()
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
    return [row.content for row in rows]

async def stream_answer(
    question: str,
    client_id: str,
    conversation_history: list[dict],
    db: AsyncSession,
    language: str = "en",
    response_style: str = "balanced",
):
    client = await db.get(Client, client_id)
    company_name = client.company_name if client else "the company"

    context_chunks = await retrieve_context(question, client_id, db)

    if not context_chunks:
        yield "I don't have enough information to answer that. Please contact our support team directly."
        return

    context = "\n\n".join(context_chunks)
    style_instruction = STYLE_INSTRUCTIONS.get(response_style, STYLE_INSTRUCTIONS["balanced"])

    system = SYSTEM_PROMPT.format(
        company_name=company_name,
        context=context,
        style_instruction=style_instruction,
    )

    messages = conversation_history[-6:] + [{"role": "user", "content": question}]

    async with client_anthropic.messages.stream(
        model="claude-sonnet-4-20250514",
        max_tokens=600 if response_style == "concise" else 1024,
        system=system,
        messages=messages,
    ) as stream:
        async for text_chunk in stream.text_stream:
            yield text_chunk
