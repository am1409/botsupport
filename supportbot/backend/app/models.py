import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from app.database import Base
import enum

class PlanType(str, enum.Enum):
    starter    = "starter"     # €99/mo  — up to 500 chats/mo
    pro        = "pro"         # €299/mo — up to 2000 chats/mo
    enterprise = "enterprise"  # €599/mo — unlimited

class Client(Base):
    __tablename__ = "clients"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email             = Column(String, unique=True, nullable=False, index=True)
    hashed_password   = Column(String, nullable=False)
    company_name      = Column(String, nullable=False)
    plan              = Column(Enum(PlanType), default=PlanType.starter)
    is_active         = Column(Boolean, default=True)
    stripe_customer_id     = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)
    subscription_status    = Column(String, default="trialing")  # trialing | active | past_due | canceled
    chat_count_this_month  = Column(Integer, default=0)
    created_at        = Column(DateTime, default=datetime.utcnow)

    documents  = relationship("Document",    back_populates="client", cascade="all, delete")
    chunks     = relationship("DocumentChunk", back_populates="client", cascade="all, delete")
    chats      = relationship("ChatSession", back_populates="client", cascade="all, delete")

class Document(Base):
    __tablename__ = "documents"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id  = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    name       = Column(String, nullable=False)
    source     = Column(String, nullable=False)  # "upload" | "url"
    source_url = Column(String, nullable=True)
    status     = Column(String, default="pending")  # pending | processing | ready | failed
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    client = relationship("Client", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete")

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id   = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    content     = Column(Text, nullable=False)
    embedding   = Column(Vector(1536))  # OpenAI/Claude embedding dimensions
    chunk_index = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.utcnow)

    client   = relationship("Client",   back_populates="chunks")
    document = relationship("Document", back_populates="chunks")

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id  = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    session_id = Column(String, nullable=False, index=True)  # browser-generated
    created_at = Column(DateTime, default=datetime.utcnow)

    client   = relationship("Client", back_populates="chats")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id"), nullable=False)
    role       = Column(String, nullable=False)  # "user" | "assistant"
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")
