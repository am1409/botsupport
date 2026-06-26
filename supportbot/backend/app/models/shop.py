# app/models/shop.py
# Add this file to your app/models/ folder
# Then import it in app/database.py so init_db() picks it up

from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func

# Reuse the existing Base from your Nomi app
# In your app/database.py, add:
#   from app.models.shop import ShopProduct, ShopOrder
# That ensures the tables get created on startup

try:
    from app.models import Base
except ImportError:
    from sqlalchemy.orm import declarative_base
    Base = declarative_base()


class ShopProduct(Base):
    __tablename__ = "shop_products"

    id = Column(Integer, primary_key=True, index=True)
    aliexpress_url = Column(String, nullable=True)
    aliexpress_id = Column(String, nullable=True, index=True)

    # AI-rewritten Dutch content
    title_nl = Column(String, nullable=False)
    description_nl = Column(Text, nullable=True)
    features = Column(JSON, default=list)          # ["Feature 1", "Feature 2", ...]

    # Pricing
    price = Column(Float, nullable=False)           # Selling price
    original_price = Column(Float, nullable=True)   # Strikethrough price
    supplier_cost = Column(Float, nullable=True)    # What you pay AliExpress

    # Media
    images = Column(JSON, default=list)             # ["https://...", ...]

    # Metadata
    category = Column(String, default="accessories")
    rating = Column(Float, nullable=True)
    orders_count = Column(Integer, default=0)
    ship_days = Column(String, default="3–7 werkdagen")
    badge = Column(String, nullable=True)           # "NIEUW", "−50%", etc.
    badge_class = Column(String, nullable=True)     # "new" or ""

    # Status
    is_active = Column(Boolean, default=False)      # Requires human approval
    created_at = Column(DateTime, server_default=func.now())


class ShopOrder(Base):
    __tablename__ = "shop_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, unique=True, nullable=False, index=True)

    # Customer
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True)

    # Shipping address stored as JSON
    # {"street": "...", "zip_code": "...", "city": "...", "country": "NL"}
    shipping_address = Column(JSON, nullable=False)

    # Items stored as JSON array
    # [{"product_id": 1, "name": "...", "qty": 2, "price": 19.95,
    #   "aliexpress_url": "...", "aliexpress_id": "...", "image": "..."}]
    items = Column(JSON, nullable=False)

    # Totals
    subtotal = Column(Float, nullable=False)
    total = Column(Float, nullable=False)

    # Payment
    payment_method = Column(String, nullable=True)
    payment_status = Column(String, default="pending")   # pending | paid | failed

    # Fulfillment lifecycle
    # pending → purchasing → purchased → shipped → delivered
    fulfillment_status = Column(String, default="pending")
    aliexpress_order_ref = Column(String, nullable=True)  # AliExpress order number
    tracking_number = Column(String, nullable=True)

    notes = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
