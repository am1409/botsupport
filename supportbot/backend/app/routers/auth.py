from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from app.database import get_db
from app.models import Client
from app.auth import hash_password, verify_password, create_access_token
import uuid

router = APIRouter()

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    company_name: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    client_id: str

@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Client).where(Client.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    client = Client(
        id=uuid.uuid4(),
        email=req.email,
        hashed_password=hash_password(req.password),
        company_name=req.company_name,
        subscription_status="trialing",
    )
    db.add(client)
    await db.commit()
    await db.refresh(client)

    token = create_access_token({"sub": str(client.id)})
    return TokenResponse(access_token=token, client_id=str(client.id))

@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Client).where(Client.email == form.username))
    client = result.scalar_one_or_none()

    if not client or not verify_password(form.password, client.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(client.id)})
    return TokenResponse(access_token=token, client_id=str(client.id))
