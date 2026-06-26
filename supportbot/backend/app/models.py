import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text, ForeignKey, Enum, Float
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID, JSON
from pgvector.sqlalchemy import Vector
from app.database import Base
from sqlalchemy.sql import func
import enum

class PlanType(str, enum.Enum):
    starter    = "starter"
    pro        = "pro"
    enterprise = "enterprise"

class Client(Base):
    __tablename__ = "clients"

    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email                  = Column(String, unique=True, nullable=False, index=True)
    hashed_password        = Column(String, nullable=False)
    company_name           = Column(String, nullable=False)
    plan                   = Column(Enum(PlanType), default=PlanType.starter)
    is_active              = Column(Boolean, default=True)
    stripe_customer_id     = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)
    subscription_status    = Column(String, default="trialing")
    chat_count_this_month  = Column(Integer, default=0)
    trial_ends_at          = Column(DateTime(timezone=True), nullable=True)
    created_at             = Column(DateTime, default=datetime.utcnow)

    documents = relationship("Document",      back_populates="client", cascade="all, delete")
    chunks    = relationship("DocumentChunk", back_populates="client", cascade="all, delete")
    chats     = relationship("ChatSession",   back_populates="client", cascade="all, delete")

class Document(Base):
    __tablename__ = "documents"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id   = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    name        = Column(String, nullable=False)
    source      = Column(String, nullable=False)
    source_url  = Column(String, nullable=True)
    status      = Column(String, default="pending")
    chunk_count = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.utcnow)

    client = relationship("Client",   back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete")

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id   = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    content     = Column(Text, nullable=False)
    embedding   = Column(Vector(1536))
    chunk_index = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.utcnow)

    client   = relationship("Client",   back_populates="chunks")
    document = relationship("Document", back_populates="chunks")

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id  = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    session_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    client   = relationship("Client",      back_populates="chats")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id"), nullable=False)
    role       = Column(String, nullable=False)
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")

# ── Dropshipping models ───────────────────────────────────────────

class ShopProduct(Base):
    __tablename__ = "shop_products"

    id = Column(Integer, primary_key=True, index=True)
    aliexpress_url = Column(String, nullable=True)
    aliexpress_id = Column(String, nullable=True)
    title_nl = Column(String, nullable=False)
    description_nl = Column(Text, nullable=True)
    features = Column(JSON, default=list)
    price = Column(Float, nullable=False)
    original_price = Column(Float, nullable=True)
    supplier_cost = Column(Float, nullable=True)
    images = Column(JSON, default=list)
    category = Column(String, default="accessories")
    rating = Column(Float, nullable=True)
    orders_count = Column(Integer, default=0)
    ship_days = Column(String, default="3–7 werkdagen")
    badge = Column(String, nullable=True)
    badge_class = Column(String, nullable=True)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class ShopOrder(Base):
    __tablename__ = "shop_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, unique=True, nullable=False)
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True)
    shipping_address = Column(JSON, nullable=False)
    items = Column(JSON, nullable=False)
    subtotal = Column(Float, nullable=False)
    total = Column(Float, nullable=False)
    payment_method = Column(String, nullable=True)
    payment_status = Column(String, default="pending")
    fulfillment_status = Column(String, default="pending")
    aliexpress_order_ref = Column(String, nullable=True)
    tracking_number = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
