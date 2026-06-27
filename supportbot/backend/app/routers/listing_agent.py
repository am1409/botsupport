# app/routers/listing_agent.py
# The core of the automation — takes an AliExpress URL,
# fetches product data, rewrites it in Dutch with Claude,
# and saves it to the database ready for approval.

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import ShopProduct
from pydantic import BaseModel
from typing import Optional
import httpx
import anthropic
import re
import json

router = APIRouter()

RAPIDAPI_KEY = "eb4f1e5a08msh2d0d2cae2651ceap1a2460jsn1e30452a1e57"


# ── Helpers ───────────────────────────────────────────────────────

def extract_item_id(url: str) -> str:
    """Extract AliExpress item ID from any AliExpress URL format."""
    patterns = [
        r"/item/(\d+)",
        r"itemId=(\d+)",
        r"product/(\d+)",
        r"/(\d{10,})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract item ID from: {url}")


def normalize_image_url(url: str) -> str:
    """Ensure image URL is absolute and high resolution."""
    if not url:
        return ""
    if url.startswith("//"):
        url = "https:" + url
    # Remove AliExpress size suffixes to get full resolution
    url = re.sub(r"_\d+x\d+.*?\.(jpg|png|jpeg|webp)", r".\1", url)
    return url


async def fetch_product_from_aliexpress(item_id: str) -> dict:
    """Fetch product details from RapidAPI AliExpress endpoint."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://aliexpress-datahub.p.rapidapi.com/item_detail_2",
            params={"itemId": item_id},
            headers={
                "x-rapidapi-key": RAPIDAPI_KEY,
                "x-rapidapi-host": "aliexpress-datahub.p.rapidapi.com",
            },
        )
    data = response.json()

    # Navigate to item data — handle different response structures
    item = (
        data.get("result", {}).get("item")
        or data.get("item")
        or data.get("data", {}).get("item")
        or {}
    )
    return item


def parse_supplier_price(item: dict) -> float:
    """Extract the supplier price from the nested AliExpress response."""
    def clean_price(val) -> float:
        """Convert any price value to a float, handling ranges like '2.68 - 17.38'."""
        if not val:
            return 0.0
        s = str(val).replace(",", ".").strip()
        # If it's a range, take the lower end
        if " - " in s:
            s = s.split(" - ")[0].strip()
        try:
            n = float(s.replace("€", "").replace("$", "").strip())
            return n if n > 0 else 0.0
        except (ValueError, AttributeError):
            return 0.0

    sku = item.get("sku", {})
    if isinstance(sku, dict):
        def_sku = sku.get("def", {})
        for key in ["promotionPrice", "price", "salePrice"]:
            val = def_sku.get(key)
            result = clean_price(val)
            if result > 0:
                return result

    # Fallback: try top-level price fields
    for key in ["salePrice", "price", "promotionPrice", "minPrice"]:
        result = clean_price(item.get(key))
        if result > 0:
            return result

    return 0.0

def parse_images(item: dict) -> list:
    """Extract all product images, normalized to HTTPS full-res URLs."""
    images = []

    # Try various image field formats
    raw_images = (
        item.get("images")
        or item.get("imageList")
        or item.get("imageUrls")
        or []
    )

    for img in raw_images:
        if isinstance(img, str):
            url = normalize_image_url(img)
            if url:
                images.append(url)
        elif isinstance(img, dict):
            url = normalize_image_url(img.get("url", ""))
            if url:
                images.append(url)

    # Single image fallback
    if not images:
        single = item.get("image") or item.get("mainImage") or ""
        if single:
            images.append(normalize_image_url(single))

    return images[:8]  # Max 8 images


async def rewrite_with_claude(
    title: str,
    description: str,
    selling_price: float,
    supplier_cost: float,
) -> dict:
    """Use Claude to rewrite product content in Dutch for NL/BE market."""
    client = anthropic.AsyncAnthropic()

    prompt = f"""Je bent een Nederlandse e-commerce copywriter die werkt voor een moderne webshop gericht op Nederland en België.

Herschrijf dit AliExpress product professioneel voor de Nederlandse markt.

ORIGINELE TITEL: {title}
ORIGINELE BESCHRIJVING: {description[:800] if description else "Niet beschikbaar"}
VERKOOPPRIJS: €{selling_price:.2f}
INKOOPPRIJS: €{supplier_cost:.2f}

Regels:
- Schrijf overtuigend maar eerlijk Nederlands
- Geen Engelse woorden tenzij gangbaar (bijv. "smartphone")  
- Beschrijving 130-180 woorden, verkooptaal maar geen overdrijving
- Features zijn concrete voordelen, geen marketing-blabla
- Badge alleen als er echt korting is of het product nieuw is

Geef ALLEEN geldige JSON terug zonder markdown:
{{
    "title_nl": "Pakkende Nederlandse producttitel, max 70 tekens",
    "description_nl": "Volledige productomschrijving in Nederlands...",
    "features": ["Concreet voordeel 1", "Concreet voordeel 2", "Concreet voordeel 3", "Concreet voordeel 4", "Concreet voordeel 5"],
    "badge": "NIEUW of -50% of leeg",
    "badge_class": "new of leeg",
    "category": "gadgets of home of fitness of accessories"
}}"""

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=900,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    # Strip any accidental markdown fences
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
    return json.loads(text)


# ── Pydantic schemas ──────────────────────────────────────────────

class ListingRequest(BaseModel):
    aliexpress_url: str
    selling_price: float
    original_price: Optional[float] = None  # Optional strikethrough price


class PublishRequest(BaseModel):
    aliexpress_url: str
    aliexpress_id: str
    title_nl: str
    description_nl: str
    features: list
    price: float
    original_price: Optional[float] = None
    supplier_cost: Optional[float] = None
    images: list
    category: str
    badge: Optional[str] = None
    badge_class: Optional[str] = None
    rating: Optional[float] = None
    orders_count: Optional[int] = 0
    ship_days: Optional[str] = "3–7 werkdagen"
    is_active: bool = False  # False = pending approval, True = live immediately


# ── Endpoints ─────────────────────────────────────────────────────

@router.post("/api/listing/process")
async def process_listing(request: ListingRequest):
    """
    Step 1: Takes AliExpress URL + selling price.
    Returns AI-rewritten product data for preview — nothing saved yet.
    """
    # Extract item ID
    try:
        item_id = extract_item_id(request.aliexpress_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Fetch from AliExpress
    try:
        item = await fetch_product_from_aliexpress(item_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AliExpress API error: {str(e)}")

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Product not found. Check the URL or try a direct AliExpress product link."
        )

    # Parse raw data
    supplier_cost = parse_supplier_price(item)
    images = parse_images(item)
    raw_title = item.get("title", "")
    raw_description = item.get("description", "") or item.get("detail", "")
    rating = float(item.get("averageStarRate") or item.get("starRating") or 0)
    orders = int(str(item.get("sales") or item.get("orders") or 0).replace(",", "").replace("+", ""))

    # Calculate margin
    margin_pct = 0
    if request.selling_price > 0 and supplier_cost > 0:
        net = request.selling_price - supplier_cost - (request.selling_price * 0.025) - 6
        margin_pct = round(net / request.selling_price * 100)

    # Rewrite with Claude
    try:
        rewritten = await rewrite_with_claude(
            raw_title, raw_description, request.selling_price, supplier_cost
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI rewrite failed: {str(e)}")

    return {
        "aliexpress_id": item_id,
        "aliexpress_url": request.aliexpress_url,
        "supplier_cost": supplier_cost,
        "selling_price": request.selling_price,
        "original_price": request.original_price,
        "margin_pct": margin_pct,
        "images": images,
        "rating": rating,
        "orders_count": orders,
        "rewritten": rewritten,
        "raw_title": raw_title,
    }


@router.post("/api/listing/publish")
async def publish_listing(request: PublishRequest, db: AsyncSession = Depends(get_db)):
    """
    Step 2: Saves the (optionally edited) product to the database.
    is_active=False means it needs manual approval in admin.
    is_active=True means it goes live immediately.
    """
    db_product = ShopProduct(
        aliexpress_url=request.aliexpress_url,
        aliexpress_id=request.aliexpress_id,
        title_nl=request.title_nl,
        description_nl=request.description_nl,
        features=request.features,
        price=request.price,
        original_price=request.original_price,
        supplier_cost=request.supplier_cost,
        images=request.images,
        category=request.category,
        badge=request.badge or None,
        badge_class=request.badge_class or None,
        rating=request.rating,
        orders_count=request.orders_count,
        ship_days=request.ship_days,
        is_active=request.is_active,
    )

    db.add(db_product)
    await db.commit()
    await db.refresh(db_product)

    return {
        "success": True,
        "product_id": db_product.id,
        "is_active": db_product.is_active,
        "message": "Product live" if db_product.is_active else "Product opgeslagen — wacht op goedkeuring",
    }
