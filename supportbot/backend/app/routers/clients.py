from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from app.database import get_db
from app.models import Client, ChatSession, ChatMessage
from app.auth import get_current_client
from app.config import settings

router = APIRouter()

class ClientProfile(BaseModel):
    id: str
    email: str
    company_name: str
    plan: str
    subscription_status: str
    chat_count_this_month: int
    embed_code: str

class UpdateProfileRequest(BaseModel):
    company_name: str | None = None

@router.get("/me", response_model=ClientProfile)
async def get_profile(client: Client = Depends(get_current_client)):
    embed_code = f'<script src="{settings.app_url}/widget.js" data-client-id="{client.id}"></script>'
    return ClientProfile(
        id=str(client.id),
        email=client.email,
        company_name=client.company_name,
        plan=client.plan.value,
        subscription_status=client.subscription_status,
        chat_count_this_month=client.chat_count_this_month,
        embed_code=embed_code,
    )

@router.patch("/me")
async def update_profile(
    req: UpdateProfileRequest,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    if req.company_name:
        client.company_name = req.company_name
    await db.commit()
    return {"updated": True}

@router.get("/analytics")
async def get_analytics(
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    """Return chat volume and recent conversation previews."""
    # Total sessions
    sessions_result = await db.execute(
        select(func.count()).where(ChatSession.client_id == client.id)
    )
    total_sessions = sessions_result.scalar()

    # Total messages
    messages_result = await db.execute(
        select(func.count(ChatMessage.id))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .where(ChatSession.client_id == client.id)
    )
    total_messages = messages_result.scalar()

    # Recent sessions with first user message
    recent_result = await db.execute(
        select(ChatSession)
        .where(ChatSession.client_id == client.id)
        .order_by(ChatSession.created_at.desc())
        .limit(10)
    )
    recent_sessions = recent_result.scalars().all()

    sessions_data = []
    for s in recent_sessions:
        msgs_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == s.id)
            .order_by(ChatMessage.created_at)
            .limit(2)
        )
        msgs = msgs_result.scalars().all()
        sessions_data.append({
            "session_id": s.session_id,
            "created_at": s.created_at.isoformat(),
            "preview": msgs[0].content[:100] if msgs else "",
            "message_count": len(msgs),
        })

    return {
        "total_sessions": total_sessions,
        "total_messages": total_messages,
        "chat_count_this_month": client.chat_count_this_month,
        "plan": client.plan.value,
        "recent_sessions": sessions_data,
    }
