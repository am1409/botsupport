# app/routers/products.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models import ShopProduct, ShopOrder
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────

class ProductCreate(BaseModel):
    aliexpress_url: Optional[str] = None
    aliexpress_id: Optional[str] = None
    title_nl: str
    description_nl: Optional[str] = None
    features: Optional[List[str]] = []
    price: float
    original_price: Optional[float] = None
    supplier_cost: Optional[float] = None
    images: Optional[List[str]] = []
    category: Optional[str] = "accessories"
    rating: Optional[float] = None
    orders_count: Optional[int] = 0
    ship_days: Optional[str] = "3–7 werkdagen"
    badge: Optional[str] = None
    badge_class: Optional[str] = None
    is_active: Optional[bool] = False


# ── Helpers ───────────────────────────────────────────────────────

def product_to_dict(p: ShopProduct) -> dict:
    return {
        "id": p.id,
        "aliexpress_url": p.aliexpress_url,
        "aliexpress_id": p.aliexpress_id,
        "title_nl": p.title_nl,
        "description_nl": p.description_nl,
        "features": p.features or [],
        "price": p.price,
        "original_price": p.original_price,
        "supplier_cost": p.supplier_cost,
        "images": p.images or [],
        "category": p.category,
        "rating": p.rating,
        "orders_count": p.orders_count,
        "ship_days": p.ship_days,
        "badge": p.badge,
        "badge_class": p.badge_class,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


# ── Public endpoints (storefront) ─────────────────────────────────

@router.get("/api/products")
async def get_active_products(db: AsyncSession = Depends(get_db)):
    """All active products — used by the public storefront."""
    result = await db.execute(
        select(ShopProduct)
        .where(ShopProduct.is_active == True)
        .order_by(ShopProduct.created_at.desc())
    )
    return [product_to_dict(p) for p in result.scalars().all()]


@router.get("/api/products/{product_id}")
async def get_product(product_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShopProduct).where(ShopProduct.id == product_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_to_dict(p)


# ── Admin endpoints ───────────────────────────────────────────────

@router.get("/api/admin/products")
async def get_all_products(db: AsyncSession = Depends(get_db)):
    """All products including pending approval — admin only."""
    result = await db.execute(
        select(ShopProduct).order_by(ShopProduct.created_at.desc())
    )
    return [product_to_dict(p) for p in result.scalars().all()]


@router.post("/api/products")
async def create_product(product: ProductCreate, db: AsyncSession = Depends(get_db)):
    db_product = ShopProduct(**product.dict())
    db.add(db_product)
    await db.commit()
    await db.refresh(db_product)
    return product_to_dict(db_product)


@router.put("/api/products/{product_id}")
async def update_product(
    product_id: int, product: ProductCreate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ShopProduct).where(ShopProduct.id == product_id))
    db_product = result.scalar_one_or_none()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    for key, value in product.dict().items():
        setattr(db_product, key, value)
    await db.commit()
    return product_to_dict(db_product)


@router.post("/api/products/{product_id}/activate")
async def activate_product(product_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShopProduct).where(ShopProduct.id == product_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    p.is_active = True
    await db.commit()
    return {"success": True}


@router.post("/api/products/{product_id}/deactivate")
async def deactivate_product(product_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShopProduct).where(ShopProduct.id == product_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    p.is_active = False
    await db.commit()
    return {"success": True}


@router.delete("/api/products/{product_id}")
async def delete_product(product_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ShopProduct).where(ShopProduct.id == product_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.delete(p)
    await db.commit()
    return {"success": True}


@router.get("/api/admin/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    products_result = await db.execute(select(ShopProduct))
    products = products_result.scalars().all()
    orders_result = await db.execute(select(ShopOrder))
    orders = orders_result.scalars().all()

    return {
        "active_products": len([p for p in products if p.is_active]),
        "pending_products": len([p for p in products if not p.is_active]),
        "total_orders": len(orders),
        "pending_fulfillment": len([o for o in orders if o.fulfillment_status == "pending"]),
        "total_revenue": round(sum(o.total for o in orders if o.payment_status == "paid"), 2),
    }
