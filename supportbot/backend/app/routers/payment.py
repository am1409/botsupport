# app/routers/payment.py
# Mollie payment integration for NL/BE market (iDEAL, Bancontact, creditcard)
#
# Setup:
#   1. Create account at mollie.com (free)
#   2. Go to Dashboard → Developers → API keys
#   3. Add MOLLIE_API_KEY to Railway env vars
#      - Test key: "test_..." (use while building)
#      - Live key: "live_..." (switch when going live)
#
# Required env vars:
#   MOLLIE_API_KEY  — from Mollie dashboard
#   STORE_URL       — e.g. https://botsupport-production.up.railway.app

import os
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import ShopOrder

router = APIRouter()

MOLLIE_API_KEY = os.getenv("MOLLIE_API_KEY", "")
STORE_URL      = os.getenv("STORE_URL", "https://botsupport-production.up.railway.app")
MOLLIE_API     = "https://api.mollie.com/v2"


# ── Helpers ───────────────────────────────────────────────────────

def mollie_headers() -> dict:
    return {
        "Authorization": f"Bearer {MOLLIE_API_KEY}",
        "Content-Type":  "application/json",
    }


async def get_mollie_payment(payment_id: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(f"{MOLLIE_API}/payments/{payment_id}", headers=mollie_headers())
    return res.json()


# ── Endpoints ─────────────────────────────────────────────────────

@router.post("/api/payment/create/{order_id}")
async def create_payment(order_id: int, db: AsyncSession = Depends(get_db)):
    """
    Called by the storefront checkout after the order is created.
    Returns { checkout_url } — frontend redirects customer there.
    """
    if not MOLLIE_API_KEY:
        # Dev mode: skip Mollie, mark order as paid immediately
        result = await db.execute(select(ShopOrder).where(ShopOrder.id == order_id))
        order = result.scalar_one_or_none()
        if order:
            order.payment_status = "paid"
            await db.commit()
        return {"checkout_url": None, "dev_mode": True, "order_id": order_id}

    result = await db.execute(select(ShopOrder).where(ShopOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Build Mollie payment request
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{MOLLIE_API}/payments",
                headers=mollie_headers(),
                json={
                    "amount": {
                        "currency": "EUR",
                        "value":    f"{order.total:.2f}",
                    },
                    "description": f"Velo bestelling {order.order_number}",
                    "redirectUrl": f"{STORE_URL}/?betaling=ok&order={order_id}",
                    "webhookUrl":  f"{STORE_URL}/api/payment/webhook",
                    "metadata":    {"order_id": str(order_id)},
                    # Allow the methods relevant to NL/BE:
                    # Mollie auto-detects available methods; no need to restrict
                },
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Mollie connection failed: {e}")

    if res.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Mollie error {res.status_code}: {res.text[:200]}",
        )

    payment = res.json()

    # Store Mollie payment ID so we can match the webhook
    order.notes = f"mollie:{payment['id']}"
    await db.commit()

    return {"checkout_url": payment["_links"]["checkout"]["href"]}


@router.post("/api/payment/webhook")
async def payment_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Mollie POSTs here when payment status changes.
    We fetch the payment from Mollie (don't trust the POST body for status).
    """
    try:
        form_data = await request.form()
        payment_id = form_data.get("id") or ""
    except Exception:
        return JSONResponse({"status": "ok"})

    if not payment_id or not MOLLIE_API_KEY:
        return JSONResponse({"status": "ok"})

    # Fetch authoritative status from Mollie
    try:
        payment = await get_mollie_payment(payment_id)
    except Exception:
        return JSONResponse({"status": "ok"})

    order_id = int(payment.get("metadata", {}).get("order_id", 0))
    if not order_id:
        return JSONResponse({"status": "ok"})

    result = await db.execute(select(ShopOrder).where(ShopOrder.id == order_id))
    order = result.scalar_one_or_none()

    if order:
        mollie_status = payment.get("status", "")

        if mollie_status == "paid" and order.payment_status != "paid":
            order.payment_status = "paid"
            await db.commit()

            # Trigger confirmation emails (import here to avoid circular import)
            try:
                from app.services.email import send_order_confirmation, send_owner_notification
                await send_order_confirmation(order)
                await send_owner_notification(order)
            except Exception as e:
                print(f"[webhook] Email send failed: {e}")

        elif mollie_status in ("canceled", "expired", "failed"):
            order.payment_status = "failed"
            await db.commit()

    # Mollie requires a 200 OK response
    return JSONResponse({"status": "ok"})


@router.get("/api/payment/status/{order_id}")
async def check_payment_status(order_id: int, db: AsyncSession = Depends(get_db)):
    """
    Polled by the frontend on the return page to check if payment was confirmed.
    """
    result = await db.execute(select(ShopOrder).where(ShopOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "order_id":       order.id,
        "order_number":   order.order_number,
        "payment_status": order.payment_status,
        "total":          order.total,
    }
