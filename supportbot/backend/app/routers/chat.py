from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import Client, ChatSession, ChatMessage, PlanType
from app.rag_engine import stream_answer
import uuid

router = APIRouter()

PLAN_LIMITS = {
    PlanType.starter:    500,
    PlanType.pro:        2000,
    PlanType.enterprise: 999999,
}

class ChatRequest(BaseModel):
    session_id: str
    message: str
    history: list[dict] = []
    language: str = "en"
    response_style: str = "balanced"

@router.post("/{client_id}")
async def chat(
    client_id: str,
    req: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    client = await db.get(Client, client_id)
    if not client or not client.is_active:
        raise HTTPException(status_code=404, detail="Invalid client")

    if client.subscription_status not in ("active", "trialing"):
        raise HTTPException(status_code=402, detail="Subscription required")

    limit = PLAN_LIMITS.get(client.plan, 500)
    if client.chat_count_this_month >= limit:
        raise HTTPException(status_code=429, detail="Monthly chat limit reached. Please upgrade your plan.")

    result = await db.execute(
        select(ChatSession).where(
            ChatSession.client_id == client_id,
            ChatSession.session_id == req.session_id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        session = ChatSession(
            id=uuid.uuid4(),
            client_id=client_id,
            session_id=req.session_id
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

    user_msg = ChatMessage(
        id=uuid.uuid4(),
        session_id=session.id,
        role="user",
        content=req.message
    )
    db.add(user_msg)
    client.chat_count_this_month += 1
    await db.commit()

    full_response = []

    async def generate():
        async for chunk in stream_answer(
            req.message,
            client_id,
            req.history,
            db,
            language=req.language,
            response_style=req.response_style,
        ):
            full_response.append(chunk)
            yield chunk

        assistant_msg = ChatMessage(
            id=uuid.uuid4(),
            session_id=session.id,
            role="assistant",
            content="".join(full_response)
        )
        db.add(assistant_msg)
        await db.commit()

    return StreamingResponse(generate(), media_type="text/plain")
