"""
Billing Router — Stripe Integration
Handles:
- Creating checkout sessions (signup → Stripe → redirect back)
- Webhook from Stripe (payment success, failure, cancellation)
- Customer portal (client manages own billing)
"""
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.config import settings
from app.database import get_db
from app.models import Client, PlanType
from app.auth import get_current_client

stripe.api_key = settings.stripe_secret_key
router = APIRouter()

PLAN_PRICE_MAP = {
    "starter":    settings.stripe_price_id_starter,
    "pro":        settings.stripe_price_id_pro,
    "enterprise": settings.stripe_price_id_enterprise,
}

PRICE_PLAN_MAP = {v: k for k, v in PLAN_PRICE_MAP.items()}

class CheckoutRequest(BaseModel):
    plan: str  # "starter" | "pro" | "enterprise"

@router.post("/checkout")
async def create_checkout(
    req: CheckoutRequest,
    client: Client = Depends(get_current_client),
    db: AsyncSession = Depends(get_db),
):
    if req.plan not in PLAN_PRICE_MAP:
        raise HTTPException(status_code=400, detail="Invalid plan")

    price_id = PLAN_PRICE_MAP[req.plan]

    # Create or retrieve Stripe customer
    if not client.stripe_customer_id:
        customer = stripe.Customer.create(email=client.email, name=client.company_name)
        client.stripe_customer_id = customer.id
        await db.commit()

    session = stripe.checkout.Session.create(
        customer=client.stripe_customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.frontend_url}/dashboard?checkout=success",
        cancel_url=f"{settings.frontend_url}/pricing?checkout=cancelled",
        metadata={"client_id": str(client.id)},
        subscription_data={"trial_period_days": 14},
    )
    return {"checkout_url": session.url}

@router.post("/portal")
async def customer_portal(client: Client = Depends(get_current_client)):
    if not client.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")

    session = stripe.billing_portal.Session.create(
        customer=client.stripe_customer_id,
        return_url=f"{settings.frontend_url}/dashboard",
    )
    return {"portal_url": session.url}

@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    data = event["data"]["object"]

    if event["type"] == "checkout.session.completed":
        client_id = data["metadata"].get("client_id")
        subscription_id = data.get("subscription")
        client = await db.get(Client, client_id)
        if client:
            client.stripe_subscription_id = subscription_id
            client.subscription_status = "trialing"
            await db.commit()

    elif event["type"] == "customer.subscription.updated":
        sub = stripe.Subscription.retrieve(data["id"])
        result = await db.execute(
            select(Client).where(Client.stripe_subscription_id == data["id"])
        )
        client = result.scalar_one_or_none()
        if client:
            client.subscription_status = data["status"]
            # Update plan based on price
            price_id = sub["items"]["data"][0]["price"]["id"]
            plan_name = PRICE_PLAN_MAP.get(price_id)
            if plan_name:
                client.plan = PlanType(plan_name)
            await db.commit()

    elif event["type"] == "customer.subscription.deleted":
        result = await db.execute(
            select(Client).where(Client.stripe_subscription_id == data["id"])
        )
        client = result.scalar_one_or_none()
        if client:
            client.subscription_status = "canceled"
            await db.commit()

    elif event["type"] == "invoice.payment_failed":
        result = await db.execute(
            select(Client).where(Client.stripe_customer_id == data["customer"])
        )
        client = result.scalar_one_or_none()
        if client:
            client.subscription_status = "past_due"
            await db.commit()

    return {"received": True}
