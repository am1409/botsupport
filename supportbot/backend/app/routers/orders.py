# app/routers/orders.py
# Updated: emails + correct payment_status handling

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.shop import ShopOrder, ShopProduct
from pydantic import BaseModel
from typing import Optional, List
import random, string, os

router = APIRouter()
MOLLIE_CONFIGURED = bool(os.getenv("MOLLIE_API_KEY"))


# ── Pydantic schemas ──────────────────────────────────────────────

class ShippingAddress(BaseModel):
    street: str
    zip_code: str
    city: str
    country: str

class OrderItem(BaseModel):
    product_id: int
    qty: int
    price: float

class OrderCreate(BaseModel):
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = None
    shipping_address: ShippingAddress
    items: List[OrderItem]
    payment_method: Optional[str] = "ideal"

class FulfillmentUpdate(BaseModel):
    status: str
    tracking_number: Optional[str] = None
    aliexpress_order_ref: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────

def generate_order_number() -> str:
    return "VLO-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))

def order_to_dict(o: ShopOrder) -> dict:
    return {
        "id":                   o.id,
        "order_number":         o.order_number,
        "customer_name":        o.customer_name,
        "customer_email":       o.customer_email,
        "customer_phone":       o.customer_phone,
        "shipping_address":     o.shipping_address,
        "items":                o.items,
        "subtotal":             o.subtotal,
        "total":                o.total,
        "payment_method":       o.payment_method,
        "payment_status":       o.payment_status,
        "fulfillment_status":   o.fulfillment_status,
        "aliexpress_order_ref": o.aliexpress_order_ref,
        "tracking_number":      o.tracking_number,
        "notes":                o.notes,
        "created_at":           o.created_at.isoformat() if o.created_at else None,
    }


# ── Public endpoints ──────────────────────────────────────────────

@router.post("/api/orders")
async def create_order(order: OrderCreate, db: AsyncSession = Depends(get_db)):
    """
    Creates the order record in the database.
    Payment status is 'pending' if Mollie is configured (payment happens next),
    or 'paid' for dev/demo mode (no Mollie key set).
    """
    items_detail = []
    subtotal = 0.0

    for item in order.items:
        result = await db.execute(select(ShopProduct).where(ShopProduct.id == item.product_id))
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

        items_detail.append({
            "product_id":    item.product_id,
            "name":          product.title_nl,
            "qty":           item.qty,
            "price":         item.price,
            "aliexpress_url": product.aliexpress_url,
            "aliexpress_id": product.aliexpress_id,
            "image":         (product.images or [None])[0],
        })
        subtotal += item.price * item.qty

    # If Mollie is set up: order starts as "pending" until webhook confirms payment
    # If no Mollie key (dev mode): mark as "paid" immediately
    initial_payment_status = "pending" if MOLLIE_CONFIGURED else "paid"

    db_order = ShopOrder(
        order_number=generate_order_number(),
        customer_name=order.customer_name,
        customer_email=order.customer_email,
        customer_phone=order.customer_phone,
        shipping_address=order.shipping_address.dict(),
        items=items_detail,
        subtotal=round(subtotal, 2),
        total=round(subtotal, 2),
        payment_method=order.payment_method,
        payment_status=initial_payment_status,
        fulfillment_status="pending",
    )
    db.add(db_order)
    await db.commit()
    await db.refresh(db_order)

    # Without Mollie: send emails immediately on order creation
    if not MOLLIE_CONFIGURED:
        try:
            from app.services.email import send_order_confirmation, send_owner_notification
            await send_order_confirmation(db_order)
            await send_owner_notification(db_order)
        except Exception as e:
            print(f"[orders] Email failed: {e}")

    return {
        "success":      True,
        "id":           db_order.id,
        "order_number": db_order.order_number,
        "needs_payment": MOLLIE_CONFIGURED,
    }


# ── Admin endpoints ───────────────────────────────────────────────

@router.get("/api/admin/orders")
async def get_all_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShopOrder).order_by(ShopOrder.created_at.desc()))
    return [order_to_dict(o) for o in result.scalars().all()]

@router.get("/api/admin/orders/{order_id}")
async def get_order(order_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShopOrder).where(ShopOrder.id == order_id))
    o = result.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_to_dict(o)

@router.put("/api/admin/orders/{order_id}/fulfillment")
async def update_fulfillment(
    order_id: int, update: FulfillmentUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ShopOrder).where(ShopOrder.id == order_id))
    o = result.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")

    prev_status = o.fulfillment_status
    o.fulfillment_status = update.status

    if update.tracking_number:
        o.tracking_number = update.tracking_number
    if update.aliexpress_order_ref:
        o.aliexpress_order_ref = update.aliexpress_order_ref

    await db.commit()

    # Send shipping email when status becomes "shipped" and tracking is available
    tracking = update.tracking_number or o.tracking_number
    if update.status == "shipped" and tracking and prev_status != "shipped":
        try:
            from app.services.email import send_shipping_notification
            await send_shipping_notification(o, tracking)
        except Exception as e:
            print(f"[fulfillment] Shipping email failed: {e}")

    return {"success": True}

@router.get("/api/admin/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    from app.models.shop import ShopProduct
    products_result = await db.execute(select(ShopProduct))
    products = products_result.scalars().all()
    orders_result = await db.execute(select(ShopOrder))
    orders = orders_result.scalars().all()
    return {
        "active_products":    len([p for p in products if p.is_active]),
        "pending_products":   len([p for p in products if not p.is_active]),
        "total_orders":       len(orders),
        "pending_fulfillment":len([o for o in orders if o.fulfillment_status == "pending"]),
        "total_revenue":      round(sum(o.total for o in orders if o.payment_status == "paid"), 2),
    }
